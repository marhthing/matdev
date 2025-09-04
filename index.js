const { spawn, spawnSync } = require('child_process')
const { existsSync } = require('fs')
const fs = require('fs-extra')
const path = require('path')

console.log('🎯 MATDEV Bot Auto-Manager')
console.log('📍 Working in:', __dirname)

// Your GitHub repository - UPDATE THIS WITH YOUR ACTUAL REPO URL
const GITHUB_REPO = 'https://github.com/YOUR_USERNAME/YOUR_REPO.git'
// Example: const GITHUB_REPO = 'https://github.com/marhthing/matdev-bot.git'

// Check if this is an initial setup or restart
const isInitialSetup = !existsSync('bot.js')

if (isInitialSetup) {
    console.log('🔧 Initial setup detected - cloning from GitHub...')
    cloneAndSetup()
} else {
    console.log('🚀 Starting MATDEV bot...')
    startBot()
}

function cloneAndSetup() {
    console.log('📥 Cloning bot from GitHub...')
    console.log('🔗 Repository:', GITHUB_REPO)

    // Remove any existing files (except this manager)
    console.log('🧹 Cleaning workspace...')
    spawnSync('bash', ['-c', 'find . -maxdepth 1 ! -name "." ! -name "index.js" ! -name "node_modules" -exec rm -rf {} +'], { stdio: 'inherit' })

    // Clone repository to a temporary directory
    const cloneResult = spawnSync('git', ['clone', GITHUB_REPO, 'temp_clone'], {
        stdio: 'inherit'
    })

    if (cloneResult.error || cloneResult.status !== 0) {
        console.error('❌ Failed to clone repository!')
        console.error('Error:', cloneResult.error?.message || `Exit code: ${cloneResult.status}`)
        process.exit(1)
    }

    // Move files from temp directory to current directory
    console.log('📁 Moving bot files...')
    const moveResult = spawnSync('bash', ['-c', 'cp -r temp_clone/* . && rm -rf temp_clone'], {
        stdio: 'inherit'
    })

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
                // Non-zero exit code means crash
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
}

// Expose functions for bot commands
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
            if (existsSync('.git')) {
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
        console.log('🔄 Force update requested - recloning repository...')
        
        // Stop current bot process and reclone
        setTimeout(() => {
            cloneAndSetup()
        }, 1000)
        
        return { message: 'Update initiated - bot will restart with latest code' }
    }
}