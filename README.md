
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

---

<div align="center">

**🚀 Ready to deploy? Fork this repository and start hosting on Replit!**

[Fork Now](https://github.com/marhthing/MATDEV-BOT/fork) • [Report Issues](https://github.com/marhthing/MATDEV-BOT/issues) • [Get Support](https://github.com/marhthing/MATDEV-BOT/discussions)

*Made with ❤️ for the WhatsApp Bot community*

</div>
