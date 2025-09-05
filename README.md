
# MATDEV WhatsApp Bot - Host Anywhere

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-Latest-blue.svg)](https://github.com/WhiskeySockets/Baileys)
[![Deploy](https://img.shields.io/badge/Deploy-One--Click-success.svg)]()

**⚡ High-Performance WhatsApp Bot with Auto-Update System**

*Host on any platform with zero configuration*

</div>

## 🚀 Quick Deploy

### Auto-Manager (Replit)
Use our auto-manager system to automatically deploy and update your bot on Replit:

<div align="center">

**📋 Copy Auto-Manager Code**

<details>
<summary><strong>📋 Click to copy index.js content</strong></summary>

```javascript
const { spawn, spawnSync } = require('child_process');
const { existsSync } = require('fs');

console.log('🎯 MATDEV Bot Auto-Manager');
console.log('📍 Working in:', __dirname);

// Your GitHub repository
const GITHUB_REPO = 'https://github.com/marhthing/MATDEV-BOT.git';

// Check if this is an initial setup, restart, or forced update
const isInitialSetup = !existsSync('bot.js') || !existsSync('config.js') || !existsSync('package.json');
const isForcedUpdate = existsSync('.update_flag.json');

if (isInitialSetup || isForcedUpdate) {
    if (isForcedUpdate) {
        console.log('🔄 Forced update detected - recloning from GitHub...');
    } else {
        console.log('🔧 Initial setup detected - cloning from GitHub...');
    }
    cloneAndSetup();
} else {
    console.log('🚀 Starting MATDEV bot...');
    startBot();
}

function cloneAndSetup() {
    console.log('📥 Cloning bot from GitHub...');
    console.log('🔗 Repository:', GITHUB_REPO);

    // Clean workspace (preserve important files)
    console.log('🧹 Cleaning workspace (preserving session folder, .env, and config.js)...');
    spawnSync('bash', ['-c', 'find . -maxdepth 1 ! -name "." ! -name "index.js" ! -name "node_modules" ! -name "session" ! -name ".env" ! -name "config.js" -exec rm -rf {} +'], { stdio: 'inherit' });

    // Clone repository
    const cloneResult = spawnSync('git', ['clone', GITHUB_REPO, 'temp_clone'], {
        stdio: 'inherit'
    });

    if (cloneResult.error || cloneResult.status !== 0) {
        console.error('❌ Failed to clone repository!');
        console.error('Error:', cloneResult.error?.message || `Exit code: ${cloneResult.status}`);
        process.exit(1);
    }

    // Backup and move files
    console.log('📁 Moving bot files (preserving existing .env and config.js)...');
    spawnSync('bash', ['-c', 'cp .env .env.backup 2>/dev/null || true; cp config.js config.js.backup 2>/dev/null || true'], { stdio: 'inherit' });
    
    const moveResult = spawnSync('bash', ['-c', 'cp -r temp_clone/. . && rm -rf temp_clone'], {
        stdio: 'inherit'
    });
    
    spawnSync('bash', ['-c', 'mv .env.backup .env 2>/dev/null || true; mv config.js.backup config.js 2>/dev/null || true'], { stdio: 'inherit' });

    if (moveResult.error || moveResult.status !== 0) {
        console.error('❌ Failed to move bot files!');
        console.error('Error:', moveResult.error?.message || `Exit code: moveResult.status}`);
        process.exit(1);
    }

    console.log('✅ Bot files moved successfully!');

    // Find entry point
    let entryPoint = findEntryPoint();
    if (!entryPoint) {
        console.error('❌ No bot entry point found!');
        process.exit(1);
    }
    console.log(`✅ Found bot entry point: ${entryPoint}`);

    // Install dependencies
    if (existsSync('package.json')) {
        console.log('📦 Installing dependencies...');
        const installResult = spawnSync('npm', ['install'], {
            stdio: 'inherit'
        });

        if (installResult.error || installResult.status !== 0) {
            console.error('❌ Failed to install dependencies');
            process.exit(1);
        }
        console.log('✅ Dependencies installed!');
    }

    // Start the bot
    startBot(entryPoint);
}

function findEntryPoint() {
    const possibleEntryPoints = ['bot.js', 'app.js', 'main.js', 'src/index.js'];
    
    for (const file of possibleEntryPoints) {
        if (existsSync(file)) {
            return file;
        }
    }

    // Check package.json for main field
    if (existsSync('package.json')) {
        try {
            const packageJson = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
            if (packageJson.main && existsSync(packageJson.main)) {
                return packageJson.main;
            }
        } catch (err) {
            console.log('⚠️ Could not read package.json main field');
        }
    }

    return null;
}

function startBot(entryPoint = 'bot.js') {
    console.log(`🚀 Starting bot: ${entryPoint}`);

    const botProcess = spawn('node', [entryPoint], {
        stdio: 'inherit'
    });

    let restartCount = 0;
    const maxRestarts = 5;

    botProcess.on('exit', (code, signal) => {
        console.log(`🔄 Bot exited with code ${code}, signal ${signal}`);
        
        if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
            if (code === 0) {
                console.log(`🔄 Restarting bot as requested...`);
                setTimeout(() => startBot(entryPoint), 2000);
            } else {
                // Check for update requests
                const isInitialSetup = !existsSync('bot.js') || !existsSync('config.js') || !existsSync('package.json');
                const isForcedUpdate = existsSync('.update_flag.json');
                
                if (isInitialSetup || isForcedUpdate) {
                    console.log('🔄 Update triggered - initiating recloning process...');
                    cloneAndSetup();
                    return;
                }
                
                restartCount++;
                if (restartCount <= maxRestarts) {
                    console.log(`🔄 Restarting bot after crash... (${restartCount}/${maxRestarts})`);
                    setTimeout(() => startBot(entryPoint), 2000);
                } else {
                    console.error('❌ Too many crash restarts, stopping');
                    process.exit(1);
                }
            }
        } else {
            console.log('🛑 Bot stopped by manager');
        }
    });

    botProcess.on('error', (error) => {
        console.error('❌ Bot start error:', error.message);
    });

    // Handle process signals
    process.on('SIGUSR1', () => {
        console.log('🔄 Received restart signal, restarting bot...');
        botProcess.kill('SIGTERM');
        setTimeout(() => startBot(entryPoint), 2000);
    });

    process.on('SIGTERM', () => {
        console.log('🛑 Received shutdown signal, stopping bot...');
        botProcess.kill('SIGTERM');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('🛑 Received interrupt signal, stopping bot...');
        botProcess.kill('SIGINT');
        process.exit(0);
    });

    console.log('✅ Bot manager running!');
}

// Prevent manager from exiting unexpectedly  
process.on('uncaughtException', (error) => {
    console.error('❌ Manager uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Manager unhandled rejection:', reason);
});
```

</details>

</div>

## 🌐 Hosting on Replit

### ☁️ Replit Setup
| Feature | Status | Notes |
|---------|--------|-------|
| **Auto-Deploy** | ✅ Supported | Fork and run automatically |
| **Always-On** | ✅ Supported | Use Replit's always-on feature |
| **Zero Config** | ✅ Supported | Works out of the box |
| **Session Persistence** | ✅ Supported | Maintains WhatsApp connection |

### 🖥️ Alternative Platforms
| Platform | Status | Notes |
|----------|---------|-------|
| **Railway** | ✅ Supported | Auto-deploy from GitHub |
| **Render** | ✅ Supported | Free tier available |
| **Heroku** | ⚠️ Limited | Use worker dyno, no longer free |
| **VPS/Server** | ✅ Supported | Install Node.js 18+ |

## 📋 Setup Instructions

### 1. Using Replit (Recommended)
1. **Fork this repository** on GitHub
2. **Create new Repl** from your forked repository
3. **Click Run** - the auto-manager will handle everything
4. **Scan QR code** that appears in console
5. **Test with** `.ping` command

### 2. Manual Clone Method
```bash
# Clone the repository
git clone https://github.com/marhthing/MATDEV-BOT.git
cd MATDEV-BOT

# Install dependencies
npm install

# Start the bot
node bot.js
```

## 📱 Getting Started

1. **Deploy your bot** using Replit or any hosting platform
2. **Open console/logs** in your hosting platform
3. **Look for QR code** in the console output
4. **Scan QR code** with WhatsApp (must be phone that will own the bot)
5. **Send `.ping`** to test if it's working
6. **Send `.help`** to see all available commands

## ⚡ Key Features

- 🚀 **Auto-Deploy**: Clone and install everything automatically
- 🔄 **Auto-Update**: Update bot with `.update` command
- 🛡️ **Anti-Delete**: Recover deleted messages automatically
- 👁️ **Anti-View Once**: Save view-once media automatically
- 📦 **Plugin System**: Modular commands and features
- 💾 **Session Persistence**: Maintains WhatsApp connection
- 🔒 **Security**: Owner-only commands and permission system
- 📊 **Message Archiving**: Stores all messages in database
- 🔍 **Advanced Logging**: Comprehensive logging system

## 🎮 Essential Commands

| Command | Description | Example |
|---------|-------------|---------|
| `.ping` | Test bot response | `.ping` |
| `.help` | Show all commands | `.help` |
| `.status` | Show bot statistics | `.status` |
| `.update` | Check for updates | `.update` |
| `.updatenow` | Force update immediately | `.updatenow` |
| `.restart` | Restart the bot | `.restart` |
| `.save` | Forward message to owner | `.save` |
| `.vv` | Save view-once media | `.vv` |

## 🛡️ Security Features

### Anti-Delete System
- Automatically detects deleted messages
- Recovers and forwards deleted content to owner
- Supports all media types (images, videos, audio, stickers)
- Preserves original message metadata

### Anti-View Once
- Saves view-once photos and videos
- Automatic forwarding to bot owner
- Preserves media quality
- Secure file storage

### Permission System
- Owner-only commands protection
- JID-based authentication
- Group and private chat management
- Secure command execution

## 🤖 Auto-Update System

Your bot includes an intelligent auto-update system:

- **`.update`** - Check for updates from GitHub repository
- **`.updatenow`** - Force update immediately with fresh clone
- **Session Preservation** - Keeps WhatsApp session during updates
- **Automatic Recovery** - Restarts after updates complete
- **Zero Downtime** - Seamless update process

## 🔧 Configuration

### Environment Variables
Create a `.env` file or set these in your hosting platform:

```env
# Bot Configuration
PREFIX=.
OWNER_NUMBER=your_whatsapp_number
BOT_NAME=MATDEV Bot

# Features
ANTI_DELETE=true
ANTI_VIEW_ONCE=true
BOT_REACTIONS=true

# Optional API Keys
WEATHER_API_KEY=your_weather_api_key
NEWS_API_KEY=your_news_api_key
REMOVE_BG_API_KEY=your_remove_bg_api_key
```

### Config.js Settings
The `config.js` file contains all bot settings and can be modified for advanced users.

## 🔧 Troubleshooting

### Bot Won't Start
- Check if Node.js 18+ is installed
- Verify all dependencies installed with `npm install`
- Check console logs for error messages
- Ensure proper file permissions

### QR Code Not Showing
- Wait 30-60 seconds after deployment
- Refresh your hosting platform's console
- Check if bot process is running
- Verify network connectivity

### Commands Not Working
- Make sure you're the bot owner (scan QR with owner's WhatsApp)
- Check if prefix is correct (default is `.`)
- Verify bot is responding with `.ping`
- Check console for error messages

### Session Issues
- Delete `session` folder and rescan QR code
- Check WhatsApp Web active sessions
- Ensure stable internet connection
- Verify phone has WhatsApp installed

### Update Problems
- Use `.updatenow` for force update
- Check GitHub repository accessibility
- Verify file permissions
- Manual restart may be required

## 💡 Pro Tips

- **Fork First**: Always fork this repository before deploying
- **Update Regularly**: Use `.update` to get latest features and security fixes
- **Monitor Logs**: Keep an eye on console output for issues
- **Backup Sessions**: Your session folder contains WhatsApp credentials
- **Use Always-On**: Enable always-on feature in Replit for 24/7 operation
- **Test Commands**: Use private chats to test new features safely

## 📊 Performance Features

- **Message Caching**: In-memory caching for faster response times
- **Database Optimization**: SQLite with automatic cleanup
- **Memory Management**: Automatic cleanup of temporary files
- **Connection Stability**: Advanced reconnection handling
- **Rate Limiting**: Built-in protection against spam and bans

## 🔌 Plugin System

The bot uses a modular plugin system:

- **Core Plugin**: Essential bot commands
- **System Plugin**: Update and maintenance commands
- **Anti-Delete Plugin**: Message recovery functionality
- **Anti-View Once Plugin**: View-once media saving
- **Media Plugin**: Image and video processing
- **Status Plugin**: WhatsApp status interaction

## 📁 Project Structure

```
MATDEV-BOT/
├── lib/                    # Core libraries
│   ├── cache.js           # Caching system
│   ├── connection.js      # WhatsApp connection management
│   ├── database.js        # SQLite database operations
│   ├── logger.js          # Logging system
│   ├── message.js         # Message handling
│   └── ...
├── plugins/               # Bot plugins
│   ├── core.js           # Essential commands
│   ├── system.js         # System commands
│   ├── antidelete.js     # Anti-delete functionality
│   └── ...
├── session/              # WhatsApp session data
├── tmp/                  # Temporary files
├── bot.js               # Main bot file
├── config.js            # Configuration
├── index.js             # Auto-manager
└── package.json         # Dependencies
```

---

<div align="center">

**🚀 Ready to deploy? Fork this repository and start hosting on Replit!**

[Fork Now](https://github.com/marhthing/MATDEV-BOT/fork) • [Report Issues](https://github.com/marhthing/MATDEV-BOT/issues) • [Get Support](https://github.com/marhthing/MATDEV-BOT/discussions)

*Made with ❤️ for the WhatsApp Bot community*

</div>
