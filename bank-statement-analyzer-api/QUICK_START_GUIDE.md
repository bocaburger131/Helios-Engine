# Bank Statement Analyzer - Quick Start Guide

## 🚀 Your First Time Starting the App (5 minutes)

### What You'll Have Running
- ✅ Local API Server (port 3002)
- ✅ ngrok Public Tunnel (HTTPS)
- ✅ Hot-reload Development Mode
- ✅ All 73 Tests Passing

---

## Step 1: Prerequisites ✋
Make sure you have these installed on your computer:
- **Node.js** v18+ (check: `node --version`)
- **npm** (comes with Node.js, check: `npm --version`)
- **ngrok** (download free at https://ngrok.com)

---

## Step 2: Start the Development Server 🎯

### Option A: Development Mode (RECOMMENDED - Auto-reload on code changes)
```bash
cd "c:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api"
npm run dev
```

**Expected Output:**
```
[nodemon] watching path(s): src\**\*
[nodemon] starting `node src/server.js`
info: Server running on http://localhost:3002
info: Health check: http://localhost:3002/health
```

✅ **Server is running** - Leave this terminal open

---

### Option B: Production Mode (if dev mode doesn't work)
```bash
cd "c:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api"
npm run start
```

Same server, but won't auto-reload when you edit code.

---

## Step 3: Open ngrok in a NEW Terminal 📡

**Keep the server terminal running above, open a NEW PowerShell window:**

```bash
cd "c:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api"
ngrok http 3002
```

**Expected Output:**
```
Session Status                online
Forwarding                    https://xxxx-xxxx-xxxx.ngrok-free.dev -> http://localhost:3002
Web Interface                 http://127.0.0.1:4040
```

✅ **ngrok is tunneling** - Save that HTTPS URL (you'll use it for testing)
✅ **Leave this terminal open**

---

## Step 4: Test the API ✅

### Option A: Quick Health Check (Fastest)
Open a **NEW PowerShell window** (keeping both above running):

```bash
curl http://localhost:3002/health
```

**Expected Response:**
```json
{
  "status":"unhealthy",
  "mongodb":"DISCONNECTED",
  "redis":"ERROR",
  "uptime":12.34
}
```

✅ That's normal - MongoDB/Redis are offline (no internet)

---

### Option B: Test via ngrok (Public Access)
From **anywhere** (even your phone), use the ngrok URL:

```bash
curl https://xxxx-xxxx-xxxx.ngrok-free.dev/health
```

Same response as above.

---

### Option C: Full Test with All Routes
```bash
# List all available API endpoints
curl http://localhost:3002/api

# Get merchants (returns empty list)
curl http://localhost:3002/api/merchants

# Get settings
curl http://localhost:3002/api/settings
```

---

## Step 5: Run the Tests 🧪

### Unit Tests (Quick - 73 tests in 5 seconds)
Open a **NEW PowerShell window**:

```bash
cd "c:\Users\Jorge Brice\Desktop\BankSatement V2\bank-statement-analyzer-api"
npm run test:unit
```

**Expected Output:**
```
 Test Files  13 passed (13)
      Tests  73 passed (73)
   Duration  5.4s
```

---

### Full Test Suite (Includes Integration Tests)
```bash
npm run test:all
```

---

## Step 6: Visual Inspection

### ngrok Dashboard (Watch Real-Time Traffic)
Open your browser and go to: http://127.0.0.1:4040

You'll see every request coming through the tunnel!

---

## 📊 What's Running

| Service | URL | Status |
|---------|-----|--------|
| **Local API** | http://localhost:3002 | ✅ Running |
| **Public Tunnel** | https://xxxx-xxxx-xxxx.ngrok-free.dev | ✅ Active |
| **Health Check** | http://localhost:3002/health | ✅ Responding |
| **MongoDB** | (Not connected) | ⚠️ No internet |
| **Redis** | (Not connected) | ⚠️ No internet |

---

## 🔧 Common Issues & Fixes

### Issue: "Port 3002 is already in use"
**Fix:**
```powershell
taskkill /F /IM node.exe
npm run dev
```

---

### Issue: "ngrok command not found"
**Fix:**
1. Download ngrok from https://ngrok.com/download
2. Extract it to a folder
3. Add to PATH or use full path: `C:\path\to\ngrok.exe http 3002`

---

### Issue: "Module not found" when running dev
**Fix:**
```bash
npm install
npm run dev
```

---

### Issue: Tests fail with "ECONNREFUSED"
**Normal!** This happens because MongoDB/Redis are offline. Tests handle this gracefully. All 73 tests still pass.

---

## 📁 Important Files to Know

| File | Purpose |
|------|---------|
| `src/app.js` | Main Express app with all routes |
| `src/server.js` | Server startup logic |
| `package.json` | Dependencies and scripts |
| `.env` | Environment variables (database, API keys, etc.) |
| `tests/unit/` | Unit tests |
| `tests/integration/` | Integration tests |

---

## 🎮 Useful Commands

```bash
# Start development mode (auto-reload)
npm run dev

# Start production mode
npm run start

# Run all unit tests
npm run test:unit

# Run with watch mode (re-run on code change)
npm run test:unit:watch

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all

# Check code for syntax errors
npm run lint

# Format code
npm run format
```

---

## 🟢 You're All Set!

When you see this in your terminal:
```
[nodemon] watching path(s): src\**\*
info: Server running on http://localhost:3002
```

✅ **Your app is ready!**

### Next Steps:
1. Edit files in `src/` → Server auto-reloads (with `npm run dev`)
2. Test via `http://localhost:3002` or the ngrok URL
3. Run tests to verify nothing broke: `npm run test:unit`

---

## 📞 Quick Reference

**3 Terminals You Should Have Open:**
1. **Terminal 1** - `npm run dev` (dev server)
2. **Terminal 2** - `ngrok http 3002` (public tunnel)
3. **Terminal 3** - For running tests/commands

**Never Close These While Working:**
- Leave Terminals 1 & 2 running
- Use Terminal 3 for testing

---

## 🎯 First-Time Checklist

- [ ] Installed Node.js & npm
- [ ] Installed ngrok
- [ ] Ran `npm run dev` successfully
- [ ] Started ngrok in separate terminal
- [ ] Got ngrok HTTPS URL
- [ ] Tested `http://localhost:3002/health`
- [ ] Ran `npm run test:unit` (all 73 pass)
- [ ] Read the important files section above

**Congratulations! You're ready to develop! 🎉**

