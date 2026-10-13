ALC Launcher - build your .exe
==============================
1. Install Node.js LTS (nodejs.org) once.
2. Double-click build.bat. It installs what it needs, builds the app, and puts an "ALC Launcher" shortcut on your Desktop.
3. Open it from the Desktop. Right-click the icon > Pin to taskbar if you like.

The finished program is the folder  dist\ALC Launcher-win32-x64  (run "ALC Launcher.exe" inside it).
Copy that whole folder to any other PC to use it there; Node.js is NOT needed to run it, only to build it.

Using it
- Click a tile to launch. Amber dot = path not set or file not found. Clicking an amber tile opens the editor.
- Edit button: change names, paths (Browse), arguments, badge text/color, group; add or delete tools.
- Right-click any tile to edit it quickly.
- Rearrange: click Edit, then drag a tile to a new spot, or into another group (Apps, Browsers, Other).
  Empty groups appear while editing so you can drop tiles into them. Click Done when finished.
- Settings are saved automatically in your user profile, so rebuilding does not erase them.

To test without building:  npm install  then  npm start

Versions
- Edit a tool > "Add version" to list each installed version with its own path (e.g. 8.5, 9.0). Each new row copies the previous path so you only change the version number in it.
- Tools with more than one version show a dropdown on the tile; pick a version and the tile launches that one.
- Settings saved by the older version are upgraded automatically. Rebuild with build.bat to get the update into your .exe.

Custom icons
- Edit a tool > Icon > "Choose image" to pick a PNG, JPG, SVG, ICO etc. It is shrunk and stored in your settings.
- "Use program's own icon" removes it and goes back to the icon pulled from the program itself.
- Rebuild with build.bat to get this into your .exe.

Opening animation
- A short intro plays when the app starts (the company logo builds in, "Powered by ACCS" cascades in with a shimmer, a progress line fills over 3 seconds, then an iris wipe and tile cascade). Click or press any key to skip it.
- If Windows "Animation effects" are off, it plays as a simple fade instead.
- Important: the bottom-right of the app shows "Build 5 / animated intro" when you are running the newest version. The animation only shows after you REBUILD (double-click build.bat) and open the new app from dist\ALC Launcher-win32-x64, or run "npm start" to test.

Adding programs
- Click the blue "+" at the top right. Fill in the name, browse to the program, optionally add versions, pick an icon, badge color and group, then Save.
- New programs get every option the built-in ones have, and can be edited or deleted later (right-click a tile, or use Edit).

Intro logo and timing
- The logo comes from logo-body.png and logo-bar.png (the two pieces of the mark, same size, stacked). logo.png is the full mark for reference.
- To change the wording, edit [['Powered by ', 'dim'], ['ACCS', 'brand']] in startSplash() in app.js.
- To change how long the intro stays up, edit the 3000 (milliseconds) in startSplash() in app.js. The animation timings are in style.css under "Opening animation".

Windows on ARM (Snapdragon, Surface Pro X, Parallels on Apple Silicon, etc.)
- build.bat now detects the processor and builds a native version (folder name ends in win32-arm64). Rebuild on the ARM PC itself.
- If the app still opens a blank window or closes right away: right-click the Desktop shortcut > Properties, and at the very end of the Target box add a space and  --safe  then click OK.

Installable web app (PWA) - phones, tablets, Macs, Chromebooks, any PC
- The same files also work as a web app that can be installed on any device. No build step is needed.
- Put this folder on any HTTPS web host (GitHub Pages, Netlify, Azure Static Web Apps, an IIS site, ...).
  Installing only works over https:// (or http://localhost for testing).
  Files the web host needs: index.html, style.css, app.js, web-api.js, sw.js, manifest.webmanifest, logo*.png, icons\
- Install it: Chrome / Edge / Android: click "Install" in the header, or the install icon in the address bar.
  iPhone / iPad: open it in Safari > Share > Add to Home Screen.
- It keeps working offline once it has been opened.
- Limits of the web version (browsers do not allow these, on any device):
    * It cannot start programs on the PC. Web links (https://...) open normally. Clicking a tile with a
      program path like C:\...\app.exe copies the path, so you can paste it into Start or Win+R.
    * No Browse button and no automatic program icons (choose a custom icon image instead).
    * Settings are stored in that browser on that device, separately from the desktop app.
  For real one-click program launching on Windows, keep using the desktop .exe from build.bat.
- To try it on this PC: run  npm run web  then open http://localhost:8080
- After changing files on the web host, bump VERSION at the top of sw.js so installed copies refresh.

Editing in VS Code
- File > Open Folder... and choose this folder.
- Open a terminal in VS Code (Ctrl+`) and run  npm install  once.
- Press F5 (Run ALC Launcher) or run  npm start  to try your changes. Close and reopen the app to see edits.
- Where things live:
    index.html   page structure (header, tiles area, editor window, intro splash)
    style.css    all styling, colors (top of file) and the intro animation ("Opening animation")
    app.js       the app logic: tiles, versions, editor, intro text and timing (startSplash)
    main.js      the desktop side: launching programs, file pickers, saving settings, safe mode
    preload.js   the small bridge between app.js and main.js
    web-api.js   the same bridge for the browser / installed web app, plus the Install button
    sw.js        offline cache for the web app
    manifest.webmanifest, icons\   web app name, colors and home-screen icons
    logo-*.png   the intro logo pieces
    build.bat    builds the .exe and Desktop shortcut
- After editing, double-click build.bat to make a new .exe.

Publishing an update (users get a notice)
- Make your changes, then open version.json and raise "build" by one (e.g. 8 -> 9). Optionally put a short
  description in "notes", e.g. "notes": "Added Sensor Builder 9.0". Commit and push to GitHub.
- Users can also click "Check for updates" at the bottom of the app at any time.
- Within a few minutes, anyone using the web version sees a bar saying "Update available" with a
  "Reload to update" button. It checks when the app opens, every 30 minutes, and when the window is reopened.
- Raising "build" also makes GitHub build the desktop app automatically (about 5 minutes) and publish it as
  ALC-Launcher-Windows.zip under Releases. Desktop users then see "Update now": it downloads only the
  changed program files (a few hundred KB) and reloads in a second. Settings are kept.
- If you changed main.js, preload.js or package.json (the desktop part), a quick update is not possible;
  desktop users get a "Download" button for the full zip instead, which they extract over their old folder.
- If you add a new file the app uses (an image, a script...), add its name to the "files" list in version.json,
  or quick updates and offline mode will not include it.
- If you don't raise "build", nobody is notified (web users still get the change the next time they open the app).

Desktop app download (for users)
- Browsers cannot start programs, so the web version offers "Get desktop app". It downloads the newest
  ALC-Launcher-Windows.zip: extract it, open the folder, double-click ALC Launcher.exe. No Node.js needed.
- Windows may say it protected your PC (the app is not code-signed): click More info > Run anyway.

Full screen
- The desktop app opens maximized (filling the screen, with the title bar and taskbar still visible).
- Press F11 for true full screen (hides the title bar and taskbar); press F11 again to go back.

IP Config
- The IP Config tile opens a Command Prompt window that runs ipconfig, showing this PC's IP address on the
  current network (look for "IPv4 Address"). It runs C:\Windows\System32\cmd.exe with the launch arguments
  /c start "IP Config" cmd /k ipconfig  (desktop app only; the browser version can only copy the path).
- To run another command the same way, add a tool with that path and arguments, replacing "ipconfig".

Look: modern or classic
- The app uses the modern look by default. Click "Classic look" at the bottom right to switch back to the
  original design (and "Modern look" to return). The choice is saved per person.
- The modern design lives entirely in modern.css; style.css is the original design. Deleting the
  <link ... modern.css> line in index.html removes the modern look for everyone.
- The code from before the redesign is saved in git under the tag "ui-classic"
  (git checkout ui-classic -- ALC-Launcher  restores those files exactly).
- Ctrl+K (or /) jumps to the search box.

The cat
- Right after the app opens, and then every 2 minutes, a small cat walks along the top of the status bar (about 30 seconds from one side to the
  other). Most visits it stops partway to groom itself, then walks off the other side. Clicks pass through it.
- "Cat: on / Cat: off" at the bottom right turns it on or off for that person.
- Timings are at the top of cat.js (EVERY, CROSS, GROOM_CHANCE, GROOM_TIME).

Change IP (Ethernet)
- Opens Windows Settings > Network & internet > Ethernet. Click your adapter, then next to "IP assignment"
  click Edit, choose Manual, turn on IPv4, and enter the IP address, subnet mask and gateway.
- Any Windows settings link works as a tool path, e.g. ms-settings:network-wifi or ms-settings:network
  (the desktop app hands these to Windows to open).
