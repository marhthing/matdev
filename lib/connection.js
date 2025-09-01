/**
 * MATDEV Connection Manager
 * Advanced connection handling with intelligent reconnection strategies
 */

const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const Logger = require('./logger');

class ConnectionManager {
    constructor(bot) {
        this.bot = bot;
        this.logger = new Logger();
        this.connectionState = {
            status: 'disconnected',
            lastConnected: null,
            totalReconnects: 0,
            consecutiveFailures: 0,
            backoffDelay: 1000
        };
        
        this.maxBackoffDelay = 300000; // 5 minutes
        this.backoffMultiplier = 1.5;
        this.maxConsecutiveFailures = 5;
    }

    /**
     * Get current connection status
     */
    getStatus() {
        return {
            ...this.connectionState,
            isConnected: this.bot.isConnected,
            uptime: this.connectionState.lastConnected ? 
                Date.now() - this.connectionState.lastConnected : 0
        };
    }

    /**
     * Handle connection state changes
     */
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect } = update;
        
        switch (connection) {
            case 'open':
                await this.handleConnectionOpen();
                break;
                
            case 'close':
                await this.handleConnectionClose(lastDisconnect);
                break;
                
            case 'connecting':
                this.handleConnecting();
                break;
        }
    }

    /**
     * Handle successful connection
     */
    async handleConnectionOpen() {
        this.connectionState.status = 'connected';
        this.connectionState.lastConnected = Date.now();
        this.connectionState.consecutiveFailures = 0;
        this.connectionState.backoffDelay = 1000; // Reset backoff
        
        this.logger.success('🟢 Connection established successfully');
        
        // Perform post-connection tasks
        await this.performHealthCheck();
    }

    /**
     * Handle connection close
     */
    async handleConnectionClose(lastDisconnect) {
        this.connectionState.status = 'disconnected';
        this.connectionState.consecutiveFailures++;
        
        const error = lastDisconnect?.error;
        const statusCode = error?.output?.statusCode;
        const reason = this.getDisconnectReason(statusCode);
        
        this.logger.warn(`🔴 Connection closed: ${reason}`);
        
        // Determine if we should reconnect
        if (this.shouldReconnect(statusCode)) {
            await this.scheduleReconnect(reason);
        } else {
            this.logger.error('🛑 Permanent disconnection detected');
            await this.handlePermanentDisconnect(reason);
        }
    }

    /**
     * Handle connecting state
     */
    handleConnecting() {
        this.connectionState.status = 'connecting';
        this.logger.info('🟡 Establishing connection...');
    }

    /**
     * Get human-readable disconnect reason
     */
    getDisconnectReason(statusCode) {
        const reasons = {
            [DisconnectReason.badSession]: 'Bad session file',
            [DisconnectReason.connectionClosed]: 'Connection closed',
            [DisconnectReason.connectionLost]: 'Connection lost',
            [DisconnectReason.connectionReplaced]: 'Connection replaced on another device',
            [DisconnectReason.loggedOut]: 'Logged out from device',
            [DisconnectReason.restartRequired]: 'Restart required',
            [DisconnectReason.timedOut]: 'Connection timed out',
            [DisconnectReason.multideviceMismatch]: 'Multi-device mismatch'
        };
        
        return reasons[statusCode] || `Unknown reason (${statusCode})`;
    }

    /**
     * Determine if reconnection should be attempted
     */
    shouldReconnect(statusCode) {
        // Don't reconnect only for actual logout
        const permanentReasons = [
            DisconnectReason.loggedOut
        ];
        
        if (permanentReasons.includes(statusCode)) {
            return false;
        }
        
        // Don't reconnect after too many consecutive failures
        if (this.connectionState.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.logger.error('Too many consecutive failures. Resetting...');
            // Reset attempts and try again
            this.connectionState.consecutiveFailures = 0;
            return true;
        }
        
        return true;
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    async scheduleReconnect(reason) {
        this.connectionState.totalReconnects++;
        
        // Calculate backoff delay
        const delay = Math.min(
            this.connectionState.backoffDelay * Math.pow(
                this.backoffMultiplier, 
                this.connectionState.consecutiveFailures
            ),
            this.maxBackoffDelay
        );
        
        this.logger.info(
            `🔄 Scheduling reconnect in ${Math.round(delay/1000)}s ` +
            `(attempt ${this.connectionState.totalReconnects}, reason: ${reason})`
        );
        
        setTimeout(() => {
            this.bot.connect();
        }, delay);
    }

    /**
     * Handle permanent disconnection
     */
    async handlePermanentDisconnect(reason) {
        this.logger.error(`❌ Permanent disconnection: ${reason}`);
        
        if (reason.includes('Logged out')) {
            this.logger.error('🗑️  Session invalid. Please delete session folder and restart.');
        }
        
        // Notify owner if configured
        if (this.bot.sock && this.bot.config?.OWNER_NUMBER) {
            try {
                await this.bot.sock.sendMessage(
                    `${this.bot.config.OWNER_NUMBER}@s.whatsapp.net`,
                    {
                        text: `🚨 *MATDEV Disconnected*\n\nReason: ${reason}\n\nManual intervention required.`
                    }
                );
            } catch (error) {
                // Ignore notification errors
            }
        }
        
        // Graceful shutdown
        process.exit(1);
    }

    /**
     * Perform connection health check
     */
    async performHealthCheck() {
        try {
            // Test basic functionality
            const user = this.bot.sock?.user;
            if (!user) {
                throw new Error('User information not available');
            }
            
            // Update connection statistics
            this.logger.info(`✅ Health check passed - Connected as ${user.name || user.id}`);
            
        } catch (error) {
            this.logger.error('❌ Health check failed:', error.message);
        }
    }

    /**
     * Force reconnection
     */
    async forceReconnect() {
        this.logger.info('🔄 Forcing reconnection...');
        
        if (this.bot.sock) {
            try {
                await this.bot.sock.logout();
            } catch (error) {
                // Ignore logout errors during force reconnect
            }
        }
        
        // Reset connection state
        this.connectionState.consecutiveFailures = 0;
        this.connectionState.backoffDelay = 1000;
        
        // Reconnect after brief delay
        setTimeout(() => {
            this.bot.connect();
        }, 2000);
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            totalReconnects: this.connectionState.totalReconnects,
            consecutiveFailures: this.connectionState.consecutiveFailures,
            uptime: this.getStatus().uptime,
            status: this.connectionState.status,
            lastConnected: this.connectionState.lastConnected
        };
    }
}

module.exports = ConnectionManager;
