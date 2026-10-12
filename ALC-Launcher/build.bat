@echo off
setlocal
cd /d "%~dp0"
title Building ALC Launcher

where node >nul 2>nul
if errorlevel 1 goto nonode

rem Build for the processor this PC actually has (Intel/AMD = x64, Windows on ARM = arm64)
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
echo Detected processor type: %ARCH%

echo Step 1 of 3: installing components (needs internet, about a minute)...
call npm install
if errorlevel 1 goto fail

if exist dist rmdir /s /q dist
echo Step 2 of 3: building ALC Launcher.exe...
call npx --yes @electron/packager . "ALC Launcher" --platform=win32 --arch=%ARCH% --out=dist --overwrite --icon=icon.ico --ignore="^/dist" --ignore="^/build\.bat"
if errorlevel 1 goto fail

echo Step 3 of 3: adding a Desktop shortcut...
set "APPDIR=%~dp0dist\ALC Launcher-win32-%ARCH%"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\ALC Launcher.lnk'); $s.TargetPath='%APPDIR%\ALC Launcher.exe'; $s.WorkingDirectory='%APPDIR%'; $s.Save()"

echo.
echo Done. Your app is in:  %APPDIR%
echo A shortcut named "ALC Launcher" is now on your Desktop.
echo You can move that folder anywhere, but re-create the shortcut if you do.
explorer "%APPDIR%"
pause
exit /b 0

:nonode
echo Node.js is not installed. Install the LTS version from https://nodejs.org, then double-click build.bat again.
start https://nodejs.org
pause
exit /b 1

:fail
echo Something went wrong. Scroll up to see the error message.
pause
exit /b 1
