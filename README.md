# Financial Organizer

Private, browser‑based organizer for assets, debts, income, expenses, and a Divorce workflow with disclosures and deadlines. Exports a clean PDF. No server required.

## Development

- `npm install`
- `npm run dev` to start Vite dev server
- `npm run build` to build static site

## Build a Windows desktop app (offline)

Package as a double‑clickable Windows app using Electron.

1) Install dependencies

```
npm install
```

2) Build the web app

```
npm run build
```

3) Test Electron locally (loads `dist/index.html` offline)

```
npm run electron:dev
```

4) Create a Windows executable installer

```
npm run electron:build
```

The installer/exe will be produced by electron‑builder under `dist/`. All data is saved locally using browser localStorage inside Electron.

### Portable/unpacked builds (to avoid installer issues)

- Unpacked dir (run the `.exe` inside the folder):

```
npm run electron:dir
```

- Portable single `.exe` (no install):

```
npm run electron:portable
```

### Troubleshooting

- ffmpeg.dll not found: Some systems block or quarantine Electron’s `ffmpeg.dll` during install.
  - Use `npm run electron:portable` to generate a portable exe and run that.
  - Or run the unpacked build (`npm run electron:dir`) and start the app from the generated folder.
  - Ensure your antivirus didn’t quarantine files. If it did, restore/allow the file or add the app folder as an exception.
  - Rebuild the installer and reinstall after allowing it through SmartScreen/AV.
