# Temporary Files Directory

This directory is used by MATDEV bot for storing temporary files during processing.

## Purpose

The `tmp` directory serves as a workspace for:
- Downloaded media files during processing
- Temporary file conversions
- Cache overflow storage
- Plugin temporary data
- Session backup files

## Automatic Management

### File Cleanup
MATDEV automatically cleans this directory:
- Files older than 24 hours are removed
- Cleanup runs every 30 minutes
- Manual cleanup via `${PREFIX}cleanup` command (owner only)

### Size Monitoring
- Directory size is monitored to prevent disk space issues
- Automatic cleanup when size exceeds configured limits
- Warnings logged when approaching capacity

### File Types
Common file types stored here:
- `.jpg`, `.png`, `.gif` - Image processing
- `.mp4`, `.avi`, `.mkv` - Video processing  
- `.mp3`, `.wav`, `.ogg` - Audio processing
- `.pdf`, `.doc`, `.txt` - Document processing
- `.json`, `.log` - Temporary data files

## Security

### File Permissions
- Temporary files are created with restricted permissions
- Automatic cleanup prevents sensitive data persistence
- No permanent storage of user media

### Privacy Protection
- Files are automatically deleted after processing
- No user content is permanently stored
- Session data and personal information are never cached here

## Configuration

### Cleanup Settings
You can configure cleanup behavior in `config.js`:
- `TEMP_FILE_TTL` - Time to live for temporary files
- `MAX_TEMP_SIZE` - Maximum directory size
- `CLEANUP_INTERVAL` - How often cleanup runs

### Manual Operations

#### Force Cleanup
Owner can manually trigger cleanup:
