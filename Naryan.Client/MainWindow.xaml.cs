using Microsoft.Web.WebView2.Core;
using System;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;

namespace Naryan.Client
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
            InitializeAsync();
        }

        async void InitializeAsync()
        {
            // A te kőkemény cache-gyilkos megoldásod (Ezért nem ragadnak be az ezeréves fájlok!)
            var options = new CoreWebView2EnvironmentOptions("--disable-cache");
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "NaryanCache"), options);
            await webView.EnsureCoreWebView2Async(env);
            await webView.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);

            // WebRTC engedélyek a hívásokhoz
            webView.CoreWebView2.PermissionRequested += (sender, args) =>
            {
                if (args.PermissionKind == CoreWebView2PermissionKind.Microphone ||
                    args.PermissionKind == CoreWebView2PermissionKind.Camera)
                {
                    args.State = CoreWebView2PermissionState.Allow;
                }
            };

            // Üzenetek a JS-ből
            //   SAVE_SERVERS:<json>     — mentett szerver lista perzisztálása
            //   UPDATE_CHECK            — frissítés keresés (manuális, Settings-ből)
            //   UPDATE_APPLY:<url>      — letöltés + telepítés indítása
            webView.WebMessageReceived += async (sender, args) =>
            {
                string? msg = args.TryGetWebMessageAsString();
                if (msg == null) return;

                if (msg.StartsWith("SAVE_SERVERS:"))
                {
                    string json = msg.Substring("SAVE_SERVERS:".Length);
                    try { File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "servers.json"), json); } catch { }
                    return;
                }

                if (msg == "UPDATE_CHECK")
                {
                    var info = await UpdateService.CheckAsync();
                    SendUpdateInfoToJs(info, manual: true);
                    return;
                }

                if (msg.StartsWith("UPDATE_APPLY:"))
                {
                    string url = msg.Substring("UPDATE_APPLY:".Length);
                    if (string.IsNullOrEmpty(url)) return;
                    _ = ApplyUpdateAsync(url);
                    return;
                }
            };

            // Amikor betöltött a HTML, beküldjük a JS-be az adatokat
            webView.NavigationCompleted += async (sender, args) =>
            {
                if (!args.IsSuccess) return;

                string serversFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "servers.json");
                string serversJson = File.Exists(serversFile) ? File.ReadAllText(serversFile) : "[]";

                string? macAddr = (from nic in NetworkInterface.GetAllNetworkInterfaces()
                                   where nic.OperationalStatus == OperationalStatus.Up
                                   select nic.GetPhysicalAddress().ToString()
                                  ).FirstOrDefault();

                if (string.IsNullOrEmpty(macAddr)) macAddr = "UNKNOWN-MAC";

                string version = UpdateService.CurrentVersion;
                await webView.CoreWebView2.ExecuteScriptAsync(
                    $"window.initDesktopData({serversJson}, '{macAddr}', '{version}');");

                // Automatikus update check induláskor (1 másodperc késleltetéssel, hogy a UI rendezni tudja magát)
                _ = Task.Delay(1000).ContinueWith(async _ =>
                {
                    var info = await UpdateService.CheckAsync();
                    if (info.HasUpdate)
                    {
                        await Application.Current.Dispatcher.InvokeAsync(() => SendUpdateInfoToJs(info, manual: false));
                    }
                });
            };

            // Fájlok betöltése a UI mappából
            string uiFolder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "UI");
            if (!Directory.Exists(uiFolder) || !File.Exists(Path.Combine(uiFolder, "index.html")))
            {
                MessageBox.Show("Hiba! Nem találom a UI mappát!", "Hiba", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // Virtuális host
            webView.CoreWebView2.SetVirtualHostNameToFolderMapping("naryan.local", uiFolder, CoreWebView2HostResourceAccessKind.Allow);

            // Böngésző funkciók
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = false;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            webView.Source = new Uri("https://naryan.local/index.html");
        }

        private async Task ApplyUpdateAsync(string downloadUrl)
        {
            // Folyamatjelző a JS oldalra
            var progress = new Progress<int>(p =>
            {
                Application.Current.Dispatcher.InvokeAsync(() =>
                    webView.CoreWebView2.ExecuteScriptAsync($"window.handleUpdateProgress && window.handleUpdateProgress({p});"));
            });

            await webView.CoreWebView2.ExecuteScriptAsync("window.handleUpdateStarted && window.handleUpdateStarted();");
            var (ok, error) = await UpdateService.ApplyAsync(downloadUrl, progress);
            if (!ok)
            {
                string esc = JsonSerializer.Serialize(error ?? "Ismeretlen hiba");
                await webView.CoreWebView2.ExecuteScriptAsync($"window.handleUpdateError && window.handleUpdateError({esc});");
            }
            // Sikeres esetben az app újraindul, nincs visszajelzés szükséges.
        }

        private void SendUpdateInfoToJs(UpdateService.UpdateInfo info, bool manual)
        {
            var payload = JsonSerializer.Serialize(new
            {
                hasUpdate = info.HasUpdate,
                latestVersion = info.LatestVersion,
                currentVersion = info.CurrentVersion,
                downloadUrl = info.DownloadUrl,
                releaseNotes = info.ReleaseNotes,
                releaseName = info.ReleaseName,
                publishedAt = info.PublishedAt,
                error = info.Error,
                manual
            });
            _ = webView.CoreWebView2.ExecuteScriptAsync($"window.handleUpdateInfo && window.handleUpdateInfo({payload});");
        }
    }
}
