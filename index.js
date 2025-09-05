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
            
            // Fetch latest commit from GitHub
            const { spawnSync } = require('child_process')
            const result = spawnSync('git', ['ls-remote', GITHUB_REPO, 'HEAD'], {
                encoding: 'utf8',
                stdio: ['inherit', 'pipe', 'inherit']
            })
            
            if (result.error || result.status !== 0) {
                return { error: 'Failed to check remote repository' }
            }
            
            const remoteCommit = result.stdout.split('\t')[0]
            
            // Get local commit if git repo exists
            let localCommit = null
            if (require('fs-extra').existsSync('.git')) {
                const localResult = spawnSync('git', ['rev-parse', 'HEAD'], {
                    encoding: 'utf8',
                    stdio: ['inherit', 'pipe', 'inherit']
                })
                
                if (localResult.status === 0) {
                    localCommit = localResult.stdout.trim()
                }
            }
            
            if (!localCommit || localCommit !== remoteCommit) {
                return { 
                    updateAvailable: true, 
                    message: `Updates available! Local: ${localCommit?.substring(0, 7) || 'none'}, Remote: ${remoteCommit.substring(0, 7)}` 
                }
            } else {
                return { 
                    updateAvailable: false, 
                    message: 'Bot is up to date!' 
                }
            }
        } catch (error) {
            return { error: error.message }
        }
    },
    
    updateNow: () => {
        console.log('🔄 Force update requested - bypassing all checks and recloning repository...')
        
        // Create update flag for completion notification
        const fs = require('fs')
        const updateInfo = {
            timestamp: Date.now(),
            requestedAt: new Date().toISOString()
        }
        fs.writeFileSync('.update_flag.json', JSON.stringify(updateInfo, null, 2))
        
        // Force immediate recloning by removing ALL key files (bypass any existence checks)
        setTimeout(() => {
            console.log('🔄 Force removing ALL key files to trigger complete recloning...')
            const filesToRemove = ['bot.js', 'config.js', 'package.json']
            
            try {
                // Remove files without checking if they exist first
                for (const file of filesToRemove) {
                    try {
                        fs.unlinkSync(file)
                        console.log(`✅ ${file} removed`)
                    } catch (err) {
                        console.log(`ℹ️ ${file} not found or already removed`)
                    }
                }
                console.log('✅ All files removed - forced recloning will be triggered')
            } catch (error) {
                console.error('❌ Failed to remove files:', error)
            }
            
            console.log('🔄 Forcing process exit to trigger complete recloning from index.js...')
            process.exit(1)
        }, 1000)
        
        return { message: 'Force update initiated - bot will restart with latest code from GitHub' }
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
    
    // Copy new files
    const moveResult = spawnSync('bash', ['-c', 'cp -r temp_clone/* . && rm -rf temp_clone'], {
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

