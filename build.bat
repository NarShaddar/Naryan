@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "BUILD_DIR=%ROOT%build"
set "CLIENT_OUT=%BUILD_DIR%\Client"
set "RELEASE_DIR=%ROOT%release"

REM --- Verzio kiolvasasa a csproj-bol ---
for /f "delims=" %%v in ('powershell -NoProfile -Command "[xml]$x = Get-Content '%ROOT%Naryan.Client\Naryan.Client.csproj'; $x.Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1"') do set "VERSION=%%v"

if "%VERSION%"=="" (
    echo [HIBA] Nem sikerult kiolvasni a verziot a csproj-bol.
    pause
    exit /b 1
)

echo ================================================
echo   NARYAN CLIENT - Build v%VERSION% (Release)
echo ================================================
echo.

REM --- Regi build kitakaritasa ---
if exist "%BUILD_DIR%" (
    echo [+] Regi build mappa torlese: %BUILD_DIR%
    rmdir /s /q "%BUILD_DIR%"
    if errorlevel 1 (
        echo [HIBA] Nem sikerult torolni a regi build mappat. Esetleg fut az app?
        pause
        exit /b 1
    )
)

mkdir "%BUILD_DIR%" >nul 2>&1
mkdir "%CLIENT_OUT%" >nul 2>&1

echo.
echo ------------------------------------------------
echo   Client publish (Release)
echo ------------------------------------------------
dotnet publish "%ROOT%Naryan.Client\Naryan.Client.csproj" -c Release -o "%CLIENT_OUT%" -p:RollForward=LatestMajor --nologo
if errorlevel 1 (
    echo.
    echo [HIBA] Client publish sikertelen!
    pause
    exit /b 1
)

REM --- Felesleges publish-melléktermekek kitörlése ---
if exist "%CLIENT_OUT%\*.pdb" del /q "%CLIENT_OUT%\*.pdb"

echo.
echo ------------------------------------------------
echo   Release zip keszitese
echo ------------------------------------------------

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
set "ZIP_NAME=Naryan.Client.v%VERSION%.zip"
set "ZIP_PATH=%RELEASE_DIR%\%ZIP_NAME%"

if exist "%ZIP_PATH%" del /q "%ZIP_PATH%"

powershell -NoProfile -Command "Compress-Archive -Path '%CLIENT_OUT%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 (
    echo [HIBA] Zip-eles sikertelen!
    pause
    exit /b 1
)

echo.
echo ================================================
echo   BUILD KESZ!
echo ================================================
echo.
echo   Verzio  : v%VERSION%
echo   Client  : %CLIENT_OUT%\Naryan.Client.exe
echo   Release : %ZIP_PATH%
echo.
echo   Release kiadasahoz:
echo     gh release create v%VERSION% "%ZIP_PATH%" --repo NarShaddar/Naryan --title "Naryan v%VERSION%" --notes "Release notes..."
echo.
endlocal
pause
exit /b 0
