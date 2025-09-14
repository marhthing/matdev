#!/usr/bin/env node

/**
 * CPU & Resource Monitor for WhatsApp Bot
 * Shows real-time CPU usage by process and file operations
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class CPUMonitor {
    constructor() {
        this.startTime = Date.now();
        this.intervals = [];
        this.logFile = 'cpu-usage.log';
        this.isMonitoring = false;
    }

    /**
     * Start monitoring CPU usage
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            console.log('⚠️ Monitoring already running');
            return;
        }

        this.isMonitoring = true;
        console.log('🔍 Starting CPU monitoring...\n');
        
        // Clear previous log
        if (fs.existsSync(this.logFile)) {
            fs.unlinkSync(this.logFile);
        }

        // Monitor processes every 5 seconds
        const processMonitor = setInterval(() => {
            this.monitorProcesses();
        }, 5000);

        // Monitor file operations every 10 seconds  
        const fileMonitor = setInterval(() => {
            this.monitorFileOperations();
        }, 10000);

        // Monitor Node.js internals every 15 seconds
        const nodeMonitor = setInterval(() => {
            this.monitorNodeInternals();
        }, 15000);

        this.intervals.push(processMonitor, fileMonitor, nodeMonitor);

        // Initial snapshot
        await this.takeSnapshot();
        
        console.log(`📊 Monitoring started. Check ${this.logFile} for detailed logs.`);
        console.log('Press Ctrl+C to stop monitoring\n');
    }

    /**
     * Monitor system processes and CPU usage
     */
    monitorProcesses() {
        exec('ps aux --sort=-%cpu | head -15', (error, stdout, stderr) => {
            if (error) return;

            const timestamp = new Date().toISOString();
            const lines = stdout.split('\n');
            
            let output = `\n=== PROCESS MONITOR [${timestamp}] ===\n`;
            
            // Header
            output += lines[0] + '\n';
            output += '─'.repeat(80) + '\n';
            
            // Top CPU processes
            for (let i = 1; i < Math.min(lines.length, 11); i++) {
                if (lines[i].trim()) {
                    const parts = lines[i].split(/\s+/);
                    const cpu = parseFloat(parts[2]) || 0;
                    
                    if (cpu > 0.1) { // Only show processes using > 0.1% CPU
                        output += lines[i] + '\n';
                    }
                }
            }
            
            this.logToFile(output);
            
            // Show high CPU processes in console
            this.showHighCPUProcesses(lines);
        });
    }

    /**
     * Monitor file operations and I/O
     */
    monitorFileOperations() {
        const timestamp = new Date().toISOString();
        let output = `\n=== FILE I/O MONITOR [${timestamp}] ===\n`;
        
        // Check for active file handles
        exec('lsof -p $(pgrep -f "node.*bot.js") 2>/dev/null | grep -E "REG|DIR" | tail -20', (error, stdout, stderr) => {
            if (!error && stdout) {
                output += 'Open files by bot process:\n';
                output += stdout;
            }
            
            // Monitor disk I/O
            exec('iostat -x 1 1 2>/dev/null | tail -10', (error, stdout, stderr) => {
                if (!error && stdout) {
                    output += '\nDisk I/O Stats:\n';
                    output += stdout;
                }
                
                this.logToFile(output);
            });
        });
    }

    /**
     * Monitor Node.js specific metrics
     */
    monitorNodeInternals() {
        const timestamp = new Date().toISOString();
        let output = `\n=== NODE.JS INTERNALS [${timestamp}] ===\n`;
        
        // Memory usage
        const memUsage = process.memoryUsage();
        output += `Memory Usage:\n`;
        output += `  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB\n`;
        output += `  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
        output += `  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
        output += `  External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB\n`;
        
        // CPU usage
        const cpuUsage = process.cpuUsage();
        output += `\nCPU Usage:\n`;
        output += `  User: ${(cpuUsage.user / 1000).toFixed(2)} ms\n`;
        output += `  System: ${(cpuUsage.system / 1000).toFixed(2)} ms\n`;
        
        // Event loop lag
        const start = process.hrtime.bigint();
        setImmediate(() => {
            const lag = Number(process.hrtime.bigint() - start) / 1000000;
            output += `  Event Loop Lag: ${lag.toFixed(2)} ms\n`;
            
            // Active handles
            output += `\nActive Handles: ${process._getActiveHandles().length}\n`;
            output += `Active Requests: ${process._getActiveRequests().length}\n`;
            
            this.logToFile(output);
        });
    }

    /**
     * Show high CPU processes in console
     */
    showHighCPUProcesses(lines) {
        const highCPU = [];
        
        for (let i = 1; i < Math.min(lines.length, 11); i++) {
            if (lines[i].trim()) {
                const parts = lines[i].split(/\s+/);
                const cpu = parseFloat(parts[2]) || 0;
                const command = parts.slice(10).join(' ');
                
                if (cpu > 1.0) { // Show processes using > 1% CPU
                    highCPU.push({ cpu, command: command.substring(0, 60) });
                }
            }
        }
        
        if (highCPU.length > 0) {
            console.log(`🚨 HIGH CPU PROCESSES (>${new Date().toLocaleTimeString()}):`);
            highCPU.forEach(proc => {
                console.log(`  ${proc.cpu.toFixed(1)}% - ${proc.command}`);
            });
            console.log('');
        }
    }

    /**
     * Take initial system snapshot
     */
    async takeSnapshot() {
        const timestamp = new Date().toISOString();
        let snapshot = `\n=== SYSTEM SNAPSHOT [${timestamp}] ===\n`;
        
        // System info
        snapshot += `Platform: ${process.platform}\n`;
        snapshot += `Architecture: ${process.arch}\n`;
        snapshot += `Node Version: ${process.version}\n`;
        snapshot += `PID: ${process.pid}\n`;
        snapshot += `Uptime: ${Math.floor(process.uptime())} seconds\n`;
        
        // Load average
        const loadavg = require('os').loadavg();
        snapshot += `Load Average: ${loadavg.map(l => l.toFixed(2)).join(', ')}\n`;
        
        // Current working directory
        snapshot += `Working Directory: ${process.cwd()}\n`;
        
        this.logToFile(snapshot);
    }

    /**
     * Log data to file
     */
    logToFile(data) {
        try {
            fs.appendFileSync(this.logFile, data + '\n');
        } catch (error) {
            console.error('❌ Error writing to log file:', error.message);
        }
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
        
        console.log('\n🛑 CPU monitoring stopped');
        console.log(`📄 Check ${this.logFile} for detailed results`);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    if (global.cpuMonitor) {
        global.cpuMonitor.stopMonitoring();
    }
    process.exit(0);
});

// Start monitoring
const monitor = new CPUMonitor();
global.cpuMonitor = monitor;

monitor.startMonitoring().catch(error => {
    console.error('❌ Monitoring failed:', error);
    process.exit(1);
});