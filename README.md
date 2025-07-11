# YouTube Downloader Server

A Node.js Express server for downloading YouTube videos and audio files using `@distube/ytdl-core`.

## Features

- Download YouTube videos in MP4 format
- Download YouTube audio in MP3 format
- Support for various quality options
- FFmpeg integration for high-quality video/audio merging
- CORS enabled for frontend integration
- Automatic temp file cleanup
- Production-ready configuration

## Prerequisites

- Node.js 18+ 
- FFmpeg (for high-quality video downloads)

## Installation

```bash
npm install
```

## Environment Variables

### Basic Configuration
- `PORT` - Server port (default: 4000, automatically set by Render.com)
- `FRONTEND_URL` - Frontend application URL for CORS (default: http://localhost:5173)
- `NODE_ENV` - Environment mode (recommended: production for deployment)

### YouTube Bot Detection Bypass Configuration
- `PROXY_URL` - Optional proxy server URL (format: http://username:password@proxy-server:port)
- `USE_IPV6` - Enable IPv6 support for requests (true/false, default: false)
- `ENABLE_COOKIES` - Enable cookies for session persistence (true/false, default: true)

**Example .env file:**
```bash
# Basic configuration
PORT=4000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Bot detection bypass (optional)
USE_IPV6=false
ENABLE_COOKIES=true
# PROXY_URL=http://your-proxy:8080
```

## Local Development

```bash
npm start
```

The server will start at `http://localhost:4000`

## API Endpoints

### GET /download

Download YouTube content.

**Query Parameters:**
- `url` (required) - YouTube video URL
- `format` (required) - Download format (`mp4` or `mp3`)
- `itag` (optional) - Specific format quality identifier

**Example:**
```
GET /download?url=https://www.youtube.com/watch?v=VIDEO_ID&format=mp4
```

### GET /progress/:downloadId

Get download progress for a specific download.

**Parameters:**
- `downloadId` - Download identifier

## Deployment on Render.com

1. **Create a new Web Service** on Render.com
2. **Connect your Git repository** containing this server code
3. **Configure the service:**
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
   - **Node Version:** 18 or higher

4. **Set Environment Variables:**
   - `FRONTEND_URL`: Your frontend deployment URL (e.g., `https://yourapp.netlify.app`)
   - `NODE_ENV`: `production`
   - `PORT`: Automatically provided by Render.com

5. **Deploy** - Render will automatically build and deploy your service

### Important Notes for Production:

- The server automatically uses `process.env.PORT` for deployment platforms
- Temp files are automatically cleaned up to prevent storage issues
- FFmpeg is available on most cloud platforms including Render.com
- CORS is configured to allow requests from any origin

## File Structure

```
server/
├── .gitignore          # Git ignore rules (excludes temp files)
├── package.json        # Dependencies and scripts
├── package-lock.json   # Locked dependency versions
├── server.js          # Main server application
├── temp/              # Temporary download files (auto-cleaned)
└── README.md          # This file
```

## Troubleshooting YouTube Bot Detection

If you encounter errors like "Sign in to confirm you're not a bot" or 403 Forbidden errors, try these solutions:

### 1. Enable Enhanced Bot Detection Bypass
```bash
# In your .env file
USE_IPV6=true
ENABLE_COOKIES=true
```

### 2. Use a Proxy Server
```bash
# In your .env file
PROXY_URL=http://your-proxy-server:8080
# or with authentication
PROXY_URL=http://username:password@proxy-server:8080
```

### 3. Common Solutions
- **Rotate IP addresses** - Use different proxy servers
- **Enable IPv6** - Set `USE_IPV6=true` to use IPv6 connections
- **Use residential proxies** - More effective than datacenter proxies
- **Implement delays** - The server automatically adds random delays between requests

### 4. Server Features for Bot Detection Bypass
- **User-Agent rotation** - Automatically rotates browser user agents
- **Request randomization** - Adds random delays and headers
- **Retry logic** - Automatically retries failed requests with different configurations
- **Enhanced headers** - Mimics real browser requests
- **Cookie support** - Maintains session persistence

## Dependencies

- **express** - Web framework
- **cors** - Cross-origin resource sharing
- **@distube/ytdl-core** - YouTube download library

## License

ISC