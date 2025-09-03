# Overview

MATDEV is a high-performance WhatsApp bot built with Node.js and the Baileys library. It's designed for reliability, security, and advanced media processing capabilities. The bot features automatic session management, anti-ban protection, comprehensive caching, and a modular plugin system for easy extensibility.

# Recent Changes

## September 3, 2025 - Initial Replit Setup
- Successfully imported GitHub project to Replit environment
- Configured Node.js environment and installed all dependencies
- Set up workflow for bot execution with console output
- Configured deployment settings for VM deployment (required for long-running bot)
- Bot successfully connects to WhatsApp and processes messages
- All 5 plugins loaded successfully (antidelete, core, media, status, system)
- Configured anti-delete feature to ignore status and newsletter messages while monitoring all other chats

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Architecture
The system follows a modular, object-oriented design with clear separation of concerns:

- **Main Bot Class (MATDEV)** - Central orchestrator that manages all components and maintains connection state
- **Connection Manager** - Handles WebSocket connections with intelligent reconnection strategies and backoff algorithms
- **Session Manager** - Manages WhatsApp authentication sessions with automatic QR code handling and pairing
- **Message Handler** - Processes incoming messages, routes commands, and applies middleware
- **Security Manager** - Implements anti-ban protection, rate limiting, and threat detection
- **Cache Manager** - Multi-tier caching system for optimal performance with separate stores for different data types

## Design Patterns
- **Singleton Pattern** - Each manager class is instantiated once and shared across the application
- **Plugin Architecture** - Modular command system allowing easy extension without core modifications
- **Middleware Pattern** - Message processing pipeline with configurable middleware chains
- **Observer Pattern** - Event-driven architecture for connection state changes and message handling

## Message Processing Pipeline
1. Raw message ingestion from Baileys WebSocket
2. Security filtering and rate limiting checks
3. Message info extraction and normalization
4. Middleware processing chain
5. Command routing and execution
6. Response generation and delivery

## Security Features
- **Rate Limiting** - Per-user message limits with sliding window algorithm
- **Anti-Ban Protection** - Intelligent message delays and burst control
- **Suspicious Activity Detection** - Pattern recognition for spam and abuse
- **Command Authorization** - Role-based access control with owner-only commands

## Performance Optimizations
- **Multi-tier Caching** - Separate caches for messages, users, groups, and media with different TTL settings
- **Concurrent Processing** - Configurable message processing limits to prevent overload
- **Smart Media Handling** - Automatic compression and format conversion with size limits
- **Memory Management** - Periodic cleanup tasks and garbage collection optimization

# External Dependencies

## Core Libraries
- **@whiskeysockets/baileys** - WhatsApp Web API implementation for bot connectivity
- **winston** - Advanced logging system with multiple outputs and log levels
- **node-cache** - In-memory caching for high-performance data storage
- **fs-extra** - Enhanced file system operations with promise support
- **moment-timezone** - Date/time manipulation with timezone support
- **chalk** - Terminal output coloring for enhanced logging visibility
- **qrcode-terminal** - QR code generation for WhatsApp pairing process

## Media Processing
- **FFmpeg** (via Heroku buildpack) - Media format conversion and manipulation
- File system operations for temporary media storage and cleanup

## Deployment Platforms
- **Heroku** - Primary deployment target with worker dyno configuration
- Custom buildpacks for FFmpeg integration
- Environment variable configuration for easy deployment

## Optional External APIs
- **Weather API** - Weather information commands (API key required)
- **News API** - News fetching functionality (API key required)
- **Remove.bg API** - Background removal for images (API key required)

## Session Storage
- Local file system for WhatsApp authentication credentials
- JSON-based session persistence with automatic backup capabilities
- Temporary directory management for media processing workflows