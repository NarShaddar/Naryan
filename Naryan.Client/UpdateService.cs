using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;

namespace Naryan.Client
{
    /// <summary>
    /// GitHub Releases alapú updater. A repó publikus, így auth nem szükséges.
    /// Flow:
    ///   1. CheckAsync() — lekéri a /releases/latest végpontot, összeveti a tag_name-et a jelenlegi verzióval.
    ///   2. ApplyAsync() — letölti a release első .zip asset-jét, kicsomagolja, indít egy .bat scriptet
    ///      ami megvárja a jelenlegi processz exit-jét, lecseréli a fájlokat és újraindítja az appot.
    /// </summary>
    public class UpdateService
    {
        // FONTOS: GitHub repo, ahol a release-eket keressük
        public const string Owner = "NarShaddar";
        public const string Repo = "Naryan";
        private const string ApiUrl = "https://api.github.com/repos/" + Owner + "/" + Repo + "/releases/latest";

        private static readonly HttpClient Http = CreateHttp();

        private static HttpClient CreateHttp()
        {
            var c = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            c.DefaultRequestHeaders.UserAgent.ParseAdd("Naryan-Client-Updater");
            c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            return c;
        }

        public static string CurrentVersion
        {
            get
            {
                var v = Assembly.GetExecutingAssembly().GetName().Version;
                return v == null ? "0.0.0" : $"{v.Major}.{v.Minor}.{v.Build}";
            }
        }

        public class UpdateInfo
        {
            public bool HasUpdate { get; set; }
            public string LatestVersion { get; set; } = "";
            public string CurrentVersion { get; set; } = "";
            public string DownloadUrl { get; set; } = "";
            public string ReleaseNotes { get; set; } = "";
            public string ReleaseName { get; set; } = "";
            public string PublishedAt { get; set; } = "";
            public string? Error { get; set; }
        }

        /// <summary>
        /// Lekérdezi a legutolsó release-t a GitHubról és összeveti a jelenlegi verzióval.
        /// Soha nem dob exception-t — hibát az UpdateInfo.Error-ban ad vissza.
        /// </summary>
        public static async Task<UpdateInfo> CheckAsync()
        {
            var info = new UpdateInfo { CurrentVersion = CurrentVersion };
            try
            {
                using var resp = await Http.GetAsync(ApiUrl);
                if (resp.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    info.Error = "Még nincs kiadott release.";
                    return info;
                }
                if (!resp.IsSuccessStatusCode)
                {
                    info.Error = $"GitHub API hiba ({(int)resp.StatusCode}).";
                    return info;
                }
                var json = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("draft", out var d) && d.GetBoolean()) { info.Error = "A legutolsó release még csak draft."; return info; }
                if (root.TryGetProperty("prerelease", out var pre) && pre.GetBoolean()) { /* pre-release-ek elfogadva */ }

                info.LatestVersion = (root.TryGetProperty("tag_name", out var tn) ? tn.GetString() ?? "" : "").TrimStart('v', 'V').Trim();
                info.ReleaseName = root.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                info.ReleaseNotes = root.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "";
                info.PublishedAt = root.TryGetProperty("published_at", out var pa) ? pa.GetString() ?? "" : "";

                // Keressük az első .zip asset-et
                if (root.TryGetProperty("assets", out var assets) && assets.ValueKind == JsonValueKind.Array)
                {
                    foreach (var asset in assets.EnumerateArray())
                    {
                        var name = asset.TryGetProperty("name", out var nm) ? nm.GetString() ?? "" : "";
                        if (name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                        {
                            info.DownloadUrl = asset.TryGetProperty("browser_download_url", out var du) ? du.GetString() ?? "" : "";
                            break;
                        }
                    }
                }

                if (string.IsNullOrEmpty(info.DownloadUrl))
                {
                    info.Error = "A release-hez nincs csatolva .zip asset.";
                    return info;
                }

                info.HasUpdate = CompareVersions(info.LatestVersion, info.CurrentVersion) > 0;
                return info;
            }
            catch (TaskCanceledException) { info.Error = "A GitHub kérés timeout-olt."; return info; }
            catch (HttpRequestException ex) { info.Error = "Hálózati hiba: " + ex.Message; return info; }
            catch (Exception ex) { info.Error = "Ismeretlen hiba: " + ex.Message; return info; }
        }

        /// <summary>Letölti a frissítést, kicsomagolja, és indít egy telepítő scriptet ami újraindítja az appot.</summary>
        public static async Task<(bool ok, string? error)> ApplyAsync(string downloadUrl, IProgress<int>? progress = null)
        {
            try
            {
                var tempDir = Path.Combine(Path.GetTempPath(), "Naryan.Update");
                var tempZip = Path.Combine(tempDir, "update.zip");
                var extractDir = Path.Combine(tempDir, "extracted");

                if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
                Directory.CreateDirectory(tempDir);

                // Letöltés progress-szel
                using (var resp = await Http.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead))
                {
                    if (!resp.IsSuccessStatusCode) return (false, $"Letöltési hiba: HTTP {(int)resp.StatusCode}");
                    var total = resp.Content.Headers.ContentLength ?? -1L;
                    using var src = await resp.Content.ReadAsStreamAsync();
                    using var dst = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None);
                    var buf = new byte[81920];
                    long readTotal = 0;
                    int read;
                    while ((read = await src.ReadAsync(buf, 0, buf.Length)) > 0)
                    {
                        await dst.WriteAsync(buf, 0, read);
                        readTotal += read;
                        if (total > 0 && progress != null)
                            progress.Report((int)(readTotal * 100 / total));
                    }
                }

                progress?.Report(100);

                // Kicsomagolás
                Directory.CreateDirectory(extractDir);
                ZipFile.ExtractToDirectory(tempZip, extractDir, overwriteFiles: true);

                // A zip belsejében a fájlok lehetnek közvetlenül a root-ban, vagy egy almappában.
                // Megkeressük azt a (sub)mappát, ami tartalmazza a Naryan.Client.exe-t.
                var payloadRoot = FindPayloadRoot(extractDir);
                if (payloadRoot == null) return (false, "A letöltött zip nem tartalmaz Naryan.Client.exe-t.");

                var currentDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
                var currentExe = Path.Combine(currentDir, "Naryan.Client.exe");
                var pid = Process.GetCurrentProcess().Id;
                var scriptPath = Path.Combine(tempDir, "apply_update.bat");

                // A telepítő script: megvárja a jelenlegi processz exit-jét, átmásolja a fájlokat, újraindítja az appot,
                // majd magát is kitörli. Robosztusabb hibakezeléssel.
                var script =
                    "@echo off\r\n" +
                    "setlocal\r\n" +
                    "set \"PID=" + pid + "\"\r\n" +
                    "set \"SRC=" + payloadRoot + "\"\r\n" +
                    "set \"DST=" + currentDir + "\"\r\n" +
                    "set \"EXE=" + currentExe + "\"\r\n" +
                    "set \"TEMPDIR=" + tempDir + "\"\r\n" +
                    "\r\n" +
                    ":wait\r\n" +
                    "tasklist /FI \"PID eq %PID%\" 2>nul | find /I \"%PID%\" >nul\r\n" +
                    "if not errorlevel 1 (\r\n" +
                    "    timeout /t 1 /nobreak >nul\r\n" +
                    "    goto wait\r\n" +
                    ")\r\n" +
                    "\r\n" +
                    "REM Atmasoljuk a friss fajlokat (rekurzivan, felulirassal)\r\n" +
                    "xcopy /Y /E /I \"%SRC%\\*\" \"%DST%\\\" >nul\r\n" +
                    "if errorlevel 1 (\r\n" +
                    "    echo Frissites masolasi hiba.\r\n" +
                    "    pause\r\n" +
                    "    goto cleanup\r\n" +
                    ")\r\n" +
                    "\r\n" +
                    "REM Inditjuk ujra az appot\r\n" +
                    "start \"\" \"%EXE%\"\r\n" +
                    "\r\n" +
                    ":cleanup\r\n" +
                    "REM Temp tisztitas (delayed, hogy a sajat batunkat is torolhessuk)\r\n" +
                    "(goto) 2>nul & rmdir /S /Q \"%TEMPDIR%\"\r\n";

                File.WriteAllText(scriptPath, script);

                // Indítjuk a scriptet láthatatlan ablakkal és lehagyott szülő processzel
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/C \"\"" + scriptPath + "\"\"",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);

                // Egy pillanatot adunk a scriptnek hogy elinduljon, majd kilépünk
                await Task.Delay(300);

                // Bezárjuk az appot — a script már fut és vár ránk
                Application.Current.Dispatcher.Invoke(() => Application.Current.Shutdown());
                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, "Telepítési hiba: " + ex.Message);
            }
        }

        private static string? FindPayloadRoot(string extractDir)
        {
            // Először a gyökérben keresünk
            if (File.Exists(Path.Combine(extractDir, "Naryan.Client.exe")))
                return extractDir;

            // Aztán az első szinten lévő almappákban
            foreach (var sub in Directory.GetDirectories(extractDir))
            {
                if (File.Exists(Path.Combine(sub, "Naryan.Client.exe")))
                    return sub;
            }

            // Mélyebb keresés (max 3 szint)
            return DeepSearch(extractDir, 3);
        }

        private static string? DeepSearch(string dir, int maxDepth)
        {
            if (maxDepth <= 0) return null;
            try
            {
                foreach (var sub in Directory.GetDirectories(dir))
                {
                    if (File.Exists(Path.Combine(sub, "Naryan.Client.exe"))) return sub;
                    var deeper = DeepSearch(sub, maxDepth - 1);
                    if (deeper != null) return deeper;
                }
            }
            catch { }
            return null;
        }

        /// <summary>Visszaad &gt;0 ha a első verzió újabb, 0 ha egyenlő, &lt;0 ha régebbi.</summary>
        public static int CompareVersions(string a, string b)
        {
            if (Version.TryParse(NormalizeVersion(a), out var va) && Version.TryParse(NormalizeVersion(b), out var vb))
                return va.CompareTo(vb);
            return string.Compare(a, b, StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeVersion(string v)
        {
            if (string.IsNullOrWhiteSpace(v)) return "0.0.0";
            v = v.TrimStart('v', 'V').Trim();
            // Pre-release tag-eket (pl. "1.0.0-beta") levágjuk a Version.TryParse miatt
            int dash = v.IndexOf('-');
            if (dash > 0) v = v.Substring(0, dash);
            // Ha csak 2 részes ("1.0"), kiegészítjük 3 részessé
            var parts = v.Split('.');
            while (parts.Length < 3) v += ".0";
            return v;
        }
    }
}
