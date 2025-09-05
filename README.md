# MATDEV WhatsApp Bot - Host Anywhere

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-Latest-blue.svg)](https://github.com/WhiskeySockets/Baileys)
[![Deploy](https://img.shields.io/badge/Deploy-One--Click-success.svg)]()

**⚡ High-Performance WhatsApp Bot with Auto-Update System**

*Host on any platform with zero configuration*

</div>

## 🚀 Quick Deploy

### Auto-Manager (Any Host)
Use our auto-manager system to automatically deploy and update your bot:

<div align="center">

**📋 Copy Auto-Manager Code**

<details>
<summary><strong>📋 Click to copy index.js content</strong></summary>

```javascript
const { spawn, spawnSync } = require('child_process')
const { existsSync } = require('fs')
//const fs = require('fs-extra')
//const path = require('path')

console.log('🎯 MATDEV Bot Auto-Manager')
console.log('📍 Working in:', __dirname)

// Your GitHub repository - UPDATE THIS WITH YOUR ACTUAL REPO URL
const GITHUB_REPO = 'https://github.com/marhthing/MATDEV-BOT.git'

// Expose manager commands IMMEDIATELY at startup - before any bot operations
console.log('🔧 Setting up manager commands...')
global.managerCommands = {
    restart: () => {
        console.log('🔄 Restart requested via bot command')
        process.kill(process.pid, 'SIGUSR1')
    },
    
    shutdown: () => {
        console.log('🛑 Shutdown requested via bot command')
        process.kill(process.pid, 'SIGTERM')
    },
    
    checkUpdates: async () => {
        try {
            console.log('🔍 Checking for updates...')
            
            // ... (truncated for brevity)
            
        } catch (error) {
            return { error: error.message }
        }
    },
    
    updateNow: () => {
        console.log('🔄 Force update requested...')
        
        // ... (truncated for brevity)
        
        return { message: 'Force update initiated' }
    }
}

console.log('✅ Manager commands ready and available globally')

// Check if this is an initial setup, restart, or forced update
// If any of these key files are missing, trigger recloning
const isInitialSetup = !existsSync('bot.js') || !existsSync('config.js') || !existsSync('package.json')
const isForcedUpdate = existsSync('.update_flag.json')

if (isInitialSetup || isForcedUpdate) {
    if (isForcedUpdate) {
        console.log('🔄 Forced update detected - recloning from GitHub...')
    } else {
        console.log('🔧 Initial setup detected - cloning from GitHub...')
    }
    cloneAndSetup()
} else {
    console.log('🚀 Starting MATDEV bot...')
    startBot()
}

function cloneAndSetup() {
    console.log('📥 Cloning bot from GitHub...')
    console.log('🔗 Repository:', GITHUB_REPO)

    // Remove any existing files (except this manager, node_modules, session, .env, and config.js)
    console.log('🧹 Cleaning workspace (preserving session folder, .env, and config.js)...')
    spawnSync('bash', ['-c', 'find . -maxdepth 1 ! -name "." ! -name "index.js" ! -name "node_modules" ! -name "session" ! -name ".env" ! -name "config.js" -exec rm -rf {} +'], { stdio: 'inherit' })

    // Clone repository to a temporary directory
    const cloneResult = spawnSync('git', ['clone', GITHUB_REPO, 'temp_clone'], {
        stdio: 'inherit'
    })

    if (cloneResult.error || cloneResult.status !== 0) {
        console.error('❌ Failed to clone repository!')
        console.error('Error:', cloneResult.error?.message || `Exit code: ${cloneResult.status}`)
        process.exit(1)
    }

    // Backup important files before copying
    console.log('📁 Moving bot files (preserving existing .env and config.js)...')
    spawnSync('bash', ['-c', 'cp .env .env.backup 2>/dev/null || true; cp config.js config.js.backup 2>/dev/null || true'], { stdio: 'inherit' })
    
    // Copy new files (including hidden files)
    const moveResult = spawnSync('bash', ['-c', 'cp -r temp_clone/. . && rm -rf temp_clone'], {
        stdio: 'inherit'
    })
    
    // Restore backed up files if they existed
    spawnSync('bash', ['-c', 'mv .env.backup .env 2>/dev/null || true; mv config.js.backup config.js 2>/dev/null || true'], { stdio: 'inherit' })

    if (moveResult.error || moveResult.status !== 0) {
        console.error('❌ Failed to move bot files!')
        console.error('Error:', moveResult.error?.message || `Exit code: ${moveResult.status}`)
        process.exit(1)
    }

    console.log('✅ Bot files moved successfully!')

    // Check what we have now
    console.log('📁 Directory after clone:')
    spawnSync('ls', ['-la'], { stdio: 'inherit' })

    // Find entry point
    let entryPoint = findEntryPoint()

    if (!entryPoint) {
        console.error('❌ No bot entry point found!')
        console.log('📁 Available JS files:')
        spawnSync('find', ['.', '-name', '*.js', '-type', 'f'], { stdio: 'inherit' })
        process.exit(1)
    }

    console.log(`✅ Found bot entry point: ${entryPoint}`)

    // Install dependencies
    if (existsSync('package.json')) {
        console.log('📦 Installing dependencies...')
        const installResult = spawnSync('npm', ['install', '--production'], {
            stdio: 'inherit'
        })

        if (installResult.error || installResult.status !== 0) {
            console.error('❌ Failed to install dependencies')
            process.exit(1)
        }
        console.log('✅ Dependencies installed!')
    }

    // Start the bot
    startBot(entryPoint)
    
    // Send update completion notification after successful reclone
    setTimeout(() => {
        sendUpdateCompleteNotification()
    }, 10000) // Wait 10 seconds for bot to fully initialize
}

function findEntryPoint() {
    const possibleEntryPoints = ['bot.js', 'app.js', 'main.js', 'src/index.js']
    
    for (const file of possibleEntryPoints) {
        if (existsSync(file)) {
            return file
        }
    }

    // Check package.json for main field
    if (existsSync('package.json')) {
        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
            if (packageJson.main && existsSync(packageJson.main)) {
                return packageJson.main
            }
        } catch (err) {
            console.log('⚠️ Could not read package.json main field')
        }
    }

    return null
}

/**
 * Send update completion notification to bot private chat
 */
async function sendUpdateCompleteNotification() {
    try {
        // Check if this was an update (look for a flag file)
        const fs = require('fs')
        const updateFlagPath = '.update_flag.json'
        
        if (!fs.existsSync(updateFlagPath)) {
            return // Not an update, skip notification
        }
        
        // Read update info
        const updateInfo = JSON.parse(fs.readFileSync(updateFlagPath, 'utf8'))
        const { spawn } = require('child_process')
        
        // Send notification via bot command
        console.log('📤 Sending update completion notification...')
        
        // Use node to send the notification
        const notificationScript = `
const fs = require('fs');
setTimeout(async () => {
    try {
        // Check if bot is ready by looking for active WhatsApp connection
        if (global.managerCommands) {
            console.log('✅ Update completed successfully - fresh code from GitHub');
            console.log('🕐 Updated at: ${new Date().toLocaleString()}');
        }
    } catch (error) {
        console.log('Notification script error:', error);
    }
}, 5000);
`
        
        // Clean up flag file
        fs.unlinkSync(updateFlagPath)
        
    } catch (error) {
        console.log('Error sending update notification:', error)
    }
}

function startBot(entryPoint = 'bot.js') {
    console.log(`🚀 Starting bot: ${entryPoint}`)

    const botProcess = spawn('node', [entryPoint], {
        stdio: 'inherit'
    })

    let restartCount = 0
    const maxRestarts = 5

    botProcess.on('exit', (code, signal) => {
        console.log(`🔄 Bot exited with code ${code}, signal ${signal}`)
        
        // Always restart unless it's a manager shutdown or interrupt
        if (signal !== 'SIGTERM' && signal !== 'SIGINT') {
            if (code === 0) {
                // Code 0 means intentional restart (like .restart command)
                console.log(`🔄 Restarting bot as requested...`)
                setTimeout(() => {
                    startBot(entryPoint)
                }, 2000)
            } else {
                // Non-zero exit code means crash or update request
                // Check if this might be an update request by checking for missing files or update flag
                const isInitialSetup = !existsSync('bot.js') || !existsSync('config.js') || !existsSync('package.json')
                const isForcedUpdate = existsSync('.update_flag.json')
                
                if (isInitialSetup || isForcedUpdate) {
                    console.log('🔄 Update triggered - initiating recloning process...')
                    cloneAndSetup()
                    return // Don't restart normally, let cloneAndSetup handle it
                }
                
                restartCount++
                if (restartCount <= maxRestarts) {
                    console.log(`🔄 Restarting bot after crash... (${restartCount}/${maxRestarts})`)
                    setTimeout(() => {
                        startBot(entryPoint)
                    }, 2000)
                } else {
                    console.error('❌ Too many crash restarts, stopping')
                    process.exit(1)
                }
            }
        } else {
            console.log('🛑 Bot stopped by manager')
        }
    })

    botProcess.on('error', (error) => {
        console.error('❌ Bot start error:', error.message)
    })

    // Handle manager restart requests
    process.on('SIGUSR1', () => {
        console.log('🔄 Received restart signal, restarting bot...')
        botProcess.kill('SIGTERM')
        setTimeout(() => {
            startBot(entryPoint)
        }, 2000)
    })

    // Handle manager shutdown requests
    process.on('SIGTERM', () => {
        console.log('🛑 Received shutdown signal, stopping bot...')
        botProcess.kill('SIGTERM')
        process.exit(0)
    })

    process.on('SIGINT', () => {
        console.log('🛑 Received interrupt signal, stopping bot...')
        botProcess.kill('SIGINT')
        process.exit(0)
    })

    console.log('✅ Bot manager running!')
    
    // Keep the manager process alive
    const keepAlive = setInterval(() => {
        // This interval keeps the manager process running
        // It will only exit when explicitly terminated
    }, 60000) // Check every minute
    
    // Store the interval for cleanup
    botProcess.keepAliveInterval = keepAlive
}

// Prevent the manager from exiting unexpectedly
process.on('uncaughtException', (error) => {
    console.error('❌ Manager uncaught exception:', error)
    // Don't exit, keep the manager running
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Manager unhandled rejection:', reason)
    // Don't exit, keep the manager running
})
```

<button onclick="copyToClipboard()" style="background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 10px;">
📋 Copy Auto-Manager Code
</button>

<script>
function copyToClipboard() {
    const code = document.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(function() {
        const btn = document.querySelector('button');
        btn.textContent = '✅ Copied!';
        btn.style.background = '#2196F3';
        setTimeout(() => {
            btn.textContent = '📋 Copy Auto-Manager Code';
            btn.style.background = '#4CAF50';
        }, 2000);
    });
}
</script>

</details>

</div>

## 🌐 Hosting Platforms

### ☁️ Cloud Platforms
| Platform | Status | Notes |
|----------|---------|-------|
| **Heroku** | ✅ Supported | Use worker dyno |
| **Railway** | ✅ Supported | Auto-deploy from GitHub |
| **Render** | ✅ Supported | Free tier available |
| **Replit** | ✅ Supported | Perfect for development |
| **Koyeb** | ✅ Supported | European hosting |
| **Digital Ocean** | ✅ Supported | Use App Platform |

### 🖥️ VPS/Server
| Platform | Status | Notes |
|----------|---------|-------|
| **Ubuntu/Debian** | ✅ Supported | Install Node.js 18+ |
| **CentOS/RHEL** | ✅ Supported | Use NodeJS repository |
| **Windows Server** | ✅ Supported | Install Node.js & Git |
| **Docker** | ✅ Supported | Use official Node image |

## 📋 Setup Instructions

### 1. Using Auto-Manager (Recommended)
1. **Create new project** on your hosting platform
2. **Copy the auto-manager code** from the button above
3. **Create `index.js`** and paste the copied code
4. **Set start command**: `node index.js`
6. **Deploy** and watch it auto-install everything!

### 2. Direct Clone Method
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

1. **Deploy your bot** using any method above
2. **Open your hosting platform's console/logs**
3. **Look for QR code** in the console output
4. **Scan the QR code** with your WhatsApp
5. **Send `.ping`** to test if it's working

## ⚡ Features

- 🚀 **Auto-Deploy**: Clone and install everything automatically
- 🔄 **Auto-Update**: Update bot with `.update` command
- 🛡️ **Anti-Ban**: Smart rate limiting and security features
- 📦 **Plugin System**: Modular commands and features
- 💾 **Session Persistence**: Maintains WhatsApp connection
- 🔒 **Security**: Owner-only commands and permission system

## 🎮 Basic Commands

| Command | Description |
|---------|-------------|
| `.ping` | Test bot response |
| `.help` | Show all commands |
| `.status` | Show bot statistics |
| `.update` | Check for updates |
| `.restart` | Restart the bot |

## 🤖 Auto-Update System

Your bot includes an intelligent auto-update system:

- **`.update`** - Check for updates from GitHub
- **`.updatenow`** - Force update immediately  
- **Session Preservation** - Keeps your WhatsApp session during updates
- **Automatic Recovery** - Restarts after updates complete

## 🔧 Troubleshooting

### Bot Won't Start
- Check if Node.js 18+ is installed
- Verify all dependencies installed with `npm install`
- Check console logs for error messages

### QR Code Not Showing
- Refresh your hosting platform's console
- Wait 30 seconds after deployment
- Check if bot process is running

### Commands Not Working
- Make sure you're the bot owner (scan QR with your WhatsApp)
- Check if prefix is correct (default is `.`)
- Verify bot is responding with `.ping`

## 💡 Tips

- **Fork First**: Always fork this repository before deploying
- **Update Regularly**: Use `.update` to get latest features
- **Monitor Logs**: Keep an eye on console output
- **Backup Sessions**: Your session folder contains WhatsApp credentials

---

<div align="center">

**🚀 Ready to deploy? Fork this repository and start hosting!**

[Fork Now](https://github.com/marhthing/MATDEV-BOT/fork) • [Report Issues](https://github.com/marhthing/MATDEV-BOT/issues) • [Get Support](https://github.com/marhthing/MATDEV-BOT/discussions)

*Made with ❤️ for the community*

</div>