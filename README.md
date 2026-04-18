# Caretaker Demo

## Run

From the repo root:

```powershell
node server.mjs
```

Or:

```powershell
npm.cmd start
```

Open:

- `http://localhost:3000/` - dashboard
- `http://localhost:3000/camera.html?role=pantry` - pantry cam
- `http://localhost:3000/camera.html?role=medicine` - medicine cam

## Test

```powershell
node tests/app.test.mjs
```

## Alternate Port

```powershell
$env:PORT=3001; node server.mjs
```
