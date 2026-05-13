<div align="center">

# 🟠 Naryan

**Modern, privát kommunikációs hálózat — szöveges chat, hangcsatornák, hívások, képernyőmegosztás.**

WPF + WebView2 desktop kliens, **automatikus frissítéssel** a GitHub releases-ből.

[![License](https://img.shields.io/badge/license-Proprietary-orange)](#)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](#)
[![.NET](https://img.shields.io/badge/.NET-8.0+-purple)](#)

</div>

---

## ✨ Funkciók

- **Szöveges chat** — csatornák, privát üzenetek (AES-titkosítva), reakciók, válaszok, markdown
- **Hangcsatorna** — közös voice szobák, képernyőmegosztás
- **Privát hívás** — WebRTC alapú audio + video DM-ben
- **Fájl megosztás** — drag & drop, képek, hangüzenetek, YouTube / GIF beágyazás
- **Modern UI** — sötét téma, egyedi accent szín, OS notifications
- **Auto-update** — induláskor figyel, GitHub releases-ből önmagát frissíti

## 📥 Telepítés

1. Tölts le egy [release zip-et](https://github.com/NarShaddar/Naryan/releases/latest)
2. Csomagold ki egy tetszőleges mappába
3. Indítsd a `Naryan.Client.exe`-t

**Szükséges:** Windows 10/11, .NET 8+ Desktop Runtime _vagy_ újabb (.NET 9, .NET 10 — a build `RollForward=LatestMajor`-ral kompatibilis bármelyikkel).

## 🚀 Auto-update

A kliens induláskor ellenőrzi a GitHub `releases/latest`-et. Ha új verzió érhető el, egy elegáns modallal kérdez. Manuálisan is futtatható a **Beállítások → Naryan Client → Frissítés keresése most** gombbal.

## 🔧 Build forrásból

```bat
git clone https://github.com/NarShaddar/Naryan.git
cd Naryan
build.bat
```

Az eredmény: `release/Naryan.Client.v<verzió>.zip` — közvetlenül feltölthető egy GitHub release-be.

A `build.bat` automatikusan kiolvassa a verziót a `Naryan.Client.csproj` `<Version>` mezőjéből.

## 🖥️ Szerver

A szerveroldal saját privát repóban él, mert tartalmaz biztonsági kódot (AES kulcsok, admin jelszó, stb.). A Naryan kliens bármelyik kompatibilis szerverre csatlakozhat.

## 📜 Licenc

Proprietary, minden jog fenntartva © 2026 NarShaddar.
