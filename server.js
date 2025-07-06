import express from 'express';
import cors from 'cors';
import ytdl from '@distube/ytdl-core';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { pipeline } from 'stream';

const pipelineAsync = promisify(pipeline);

// Store active download progress
const downloadProgress = new Map();

// Enhanced bot detection bypass configuration
function getEnhancedRequestOptions() {
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      // Add additional headers for better bot detection bypass
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com'
    },
    // Add timeout and retry configurations
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    // Add IPv6 support if enabled
    family: USE_IPV6 ? 6 : 0,
    // Enable cookie jar if configured
    jar: ENABLE_COOKIES
  };
  
  // Add proxy configuration if provided
  if (PROXY_URL) {
    options.proxy = PROXY_URL;
    console.log('Using proxy for requests');
  }
  
  return options;
}

// Function to get enhanced ytdl options with bot detection bypass
function getEnhancedYtdlOptions(baseOptions = {}) {
  const enhancedRequestOptions = getEnhancedRequestOptions();
  
  return {
    ...baseOptions,
    requestOptions: {
      ...enhancedRequestOptions,
      // Add additional request options for better bot detection bypass
      transform: undefined, // Disable any request transformations
      jar: ENABLE_COOKIES, // Enable cookie jar for session persistence based on config
      followRedirect: true,
      maxRedirects: 5,
      // Add IPv6 preference to avoid some bot detection
      family: USE_IPV6 ? 6 : 0, // Use IPv6 if enabled, otherwise both
      // Add custom agent options
      agent: false, // Disable keep-alive agent to avoid detection
      // Add request timing randomization
      delay: Math.floor(Math.random() * 1000) + 500 // Random delay between 500-1500ms
    },
    // Add player options for better compatibility
    playerOptions: {
      hl: 'en',
      gl: 'US'
    },
    // Add format selection options
    lang: 'en',
    // Use alternative player clients to bypass bot detection
    playerClients: ['WEB_EMBEDDED', 'ANDROID', 'IOS'],
    // Disable signature verification that might trigger bot detection
    disableDefaultUA: false
  };
}

// Function to handle YouTube anti-bot measures with retry logic
async function createYtdlStreamWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} to create ytdl stream`);
      
      // Add random delay between attempts to avoid rate limiting
      if (attempt > 1) {
        const delay = Math.floor(Math.random() * 2000) + 1000; // 1-3 seconds
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Rotate User-Agent for each retry with more diverse options
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      ];
      
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
      const enhancedOptions = {
        ...options,
        requestOptions: {
          ...options.requestOptions,
          headers: {
            ...options.requestOptions.headers,
            'User-Agent': randomUA,
            // Add randomized additional headers for each retry
            'X-Forwarded-For': `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
          }
        },
        // Rotate player clients for each attempt
        playerClients: attempt === 1 ? ['WEB_EMBEDDED'] : attempt === 2 ? ['ANDROID'] : ['IOS', 'WEB']
      };
      
      return ytdl(String(url), enhancedOptions);
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Check if it's a bot detection error
      if (error.message.includes('Sign in to confirm') || 
          error.message.includes('bot') || 
          error.message.includes('403') ||
          error.message.includes('429') ||
          error.message.includes('UnrecoverableError')) {
        console.log(`Bot detection error detected on attempt ${attempt}:`, error.message);
        console.log('Implementing additional bypass measures for next attempt...');
        // Continue to next attempt with different configuration
      } else {
        // For other errors, throw immediately
        console.error('Non-bot detection error:', error.message);
        throw error;
      }
    }
  }
}

// Enhanced function to get video info with multiple bypass strategies
async function getVideoInfoWithRetry(url, maxRetries = 5) {
  // Try different extraction strategies
  const strategies = [
    { name: 'WEB_EMBEDDED', options: { clientName: 'WEB_EMBEDDED', clientVersion: '1.20231201.01.00' } },
    { name: 'ANDROID', options: { clientName: 'ANDROID', clientVersion: '17.31.35' } },
    { name: 'IOS', options: { clientName: 'IOS', clientVersion: '17.33.2' } },
    { name: 'TVHTML5_SIMPLY_EMBEDDED', options: { clientName: 'TVHTML5_SIMPLY_EMBEDDED', clientVersion: '2.0' } },
    { name: 'WEB_CREATOR', options: { clientName: 'WEB_CREATOR', clientVersion: '1.20231201.01.00' } }
  ];
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries} to get video info for:`, url);
      
      // Add progressive delay between attempts
      if (attempt > 1) {
        const delay = Math.floor(Math.random() * 3000) + (attempt * 1000); // Progressive delay
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Rotate User-Agent and strategies
      const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      ];
      
      const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
      const currentStrategy = strategies[(attempt - 1) % strategies.length];
      
      console.log(`Using strategy: ${currentStrategy.name}`);
      console.log(`Using User-Agent: ${randomUA.substring(0, 50)}...`);
      
      const enhancedOptions = {
        ...getEnhancedYtdlOptions(),
        ...currentStrategy.options,
        requestOptions: {
          ...getEnhancedRequestOptions(),
          headers: {
            ...getEnhancedRequestOptions().headers,
            'User-Agent': randomUA,
            // Add randomized headers
            'X-Forwarded-For': `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            'X-Real-IP': `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            // Add more realistic headers
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none'
          },
          timeout: 30000,
          maxRedirects: 10
        },
        // Additional bypass options
        bypassAgeGate: true,
        includeHLSManifest: false,
        includeDashManifest: false
      };
      
      // Try to get video info
      const info = await ytdl.getInfo(url, enhancedOptions);
      console.log(`Successfully got video info on attempt ${attempt} using ${currentStrategy.name}`);
      return info;
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      // Check if it's a bot detection or server error
      if (error.message.includes('Sign in to confirm') || 
          error.message.includes('bot') || 
          error.message.includes('403') ||
          error.message.includes('429') ||
          error.message.includes('500') ||
          error.message.includes('UnrecoverableError') ||
          error.message.includes('Video unavailable')) {
        console.log(`Bot detection/server error detected on attempt ${attempt}:`, error.message);
        console.log('Implementing additional bypass measures for next attempt...');
        // Continue to next attempt with different configuration
      } else {
        // For other errors, throw immediately
        console.error('Non-bot detection error:', error.message);
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${error.message}`);
      }
    }
  }
}

// Function to check if FFmpeg is available
async function checkFFmpegAvailability() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpeg.on('error', () => resolve(false));
    ffmpeg.on('exit', (code) => resolve(code === 0));
  });
}

// Function to merge video and audio using FFmpeg
function mergeVideoAudio(videoFile, audioFile, outputFile, downloadId = null) {
  return new Promise((resolve, reject) => {
    console.log('Starting FFmpeg merge process...');
    console.log('Video file:', videoFile);
    console.log('Audio file:', audioFile);
    console.log('Output file:', outputFile);
    
    const ffmpeg = spawn('ffmpeg', [
      '-y', // Overwrite output file if it exists
      '-i', videoFile,
      '-i', audioFile,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-f', 'mp4',
      '-movflags', 'faststart',
      '-progress', 'pipe:1', // Enable progress output
      outputFile
    ]);
    
    let stderr = '';
    let stdout = '';
    let duration = 0;
    let currentTime = 0;
    
    // Update progress to show merge started
    if (downloadId && downloadProgress.has(downloadId)) {
      downloadProgress.set(downloadId, {
        ...downloadProgress.get(downloadId),
        stage: 'Fusion vidéo/audio en cours...',
        percentage: 75
      });
    }
    
    // Capture FFmpeg output for debugging and progress tracking
    ffmpeg.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('FFmpeg stdout:', output); // Debug log
      
      // Parse FFmpeg progress output
      const lines = output.split('\n');
      for (const line of lines) {
        // Handle time-based progress (out_time_ms or out_time)
        if (line.startsWith('out_time_ms=')) {
          const timeMs = parseInt(line.split('=')[1]);
          if (!isNaN(timeMs)) {
            currentTime = timeMs / 1000; // Convert milliseconds to seconds
          }
        } else if (line.startsWith('out_time=')) {
          // Parse time format like "00:01:23.45"
          const timeStr = line.split('=')[1];
          const timeMatch = timeStr.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            currentTime = hours * 3600 + minutes * 60 + seconds;
          }
        } else if (line.startsWith('frame=')) {
          // Handle frame-based progress
          const frameNum = parseInt(line.split('=')[1]);
          if (!isNaN(frameNum) && frameNum > 0) {
            // Estimate progress based on frame count (rough estimation)
            // We'll update this more accurately when we get time info
            if (downloadId && downloadProgress.has(downloadId)) {
              const estimatedProgress = Math.min(Math.floor(frameNum / 100), 15); // Rough estimate
              const newPercentage = 75 + estimatedProgress;
              downloadProgress.set(downloadId, {
                ...downloadProgress.get(downloadId),
                percentage: newPercentage,
                stage: `Fusion en cours... (frame ${frameNum})`
              });
            }
          }
        }
      }
      
      // Update progress if we have duration and time-based progress
      if (downloadId && downloadProgress.has(downloadId) && duration > 0 && currentTime > 0) {
        const mergeProgress = Math.min(Math.floor((currentTime / duration) * 20), 20); // 20% for merge
        const newPercentage = 75 + mergeProgress;
        downloadProgress.set(downloadId, {
          ...downloadProgress.get(downloadId),
          percentage: newPercentage,
          stage: `Fusion en cours... ${Math.floor((currentTime / duration) * 100)}%`
        });
      }
    });
    
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.log('FFmpeg stderr:', output);
      
      // Parse duration from stderr (FFmpeg outputs duration info here)
      if (output.includes('Duration:')) {
        console.log('Found duration line:', output.trim());
      }
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d+)/);
      if (durationMatch && duration === 0) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseInt(durationMatch[3]);
        const milliseconds = parseInt(durationMatch[4].padEnd(3, '0').substring(0, 3)); // Handle variable decimal places
        duration = hours * 3600 + minutes * 60 + seconds + (milliseconds / 1000);
        console.log('Detected video duration:', duration, 'seconds');
      }
    });
    
    ffmpeg.on('exit', (code) => {
      console.log(`FFmpeg process exited with code: ${code}`);
      if (stderr) {
        console.log('FFmpeg stderr output:', stderr);
      }
      if (stdout) {
        console.log('FFmpeg stdout output:', stdout);
      }
      
      if (code === 0) {
        console.log('FFmpeg merge completed successfully');
        // Update progress to show completion
        if (downloadId && downloadProgress.has(downloadId)) {
          downloadProgress.set(downloadId, {
            ...downloadProgress.get(downloadId),
            percentage: 95,
            stage: 'Fusion terminée'
          });
        }
        resolve();
      } else {
        const errorMsg = `FFmpeg exited with code ${code}. Error: ${stderr || 'No error details available'}`;
        console.error('FFmpeg merge failed:', errorMsg);
        reject(new Error(errorMsg));
      }
    });
    
    ffmpeg.on('error', (error) => {
      console.error('FFmpeg spawn error:', error);
      reject(new Error(`Failed to start FFmpeg: ${error.message}`));
    });
  });
}

/**
 * Handle FFmpeg merging of separate video and audio streams for high-quality downloads
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} url - YouTube video URL
 * @param {Object} videoFormat - Video format object from ytdl
 * @param {Object} audioFormat - Audio format object from ytdl
 * @param {string} sanitizedTitle - Sanitized video title for filename
 * @returns {Promise} - Promise that resolves when streaming is complete
 */
async function handleFFmpegMergeNew(req, res, url, videoFormat, audioFormat, sanitizedTitle, providedDownloadId = null) {
  const tempDir = path.join(process.cwd(), 'temp');
  
  // Extract timestamp from providedDownloadId or generate new one
  let timestamp;
  let downloadId;
  
  if (providedDownloadId) {
    downloadId = providedDownloadId;
    // Extract timestamp from downloadId (format: download_1234567890)
    const timestampMatch = providedDownloadId.match(/download_(\d+)/);
    timestamp = timestampMatch ? parseInt(timestampMatch[1]) : Date.now();
    console.log('Using provided download ID:', downloadId, 'with timestamp:', timestamp);
  } else {
    timestamp = Date.now();
    downloadId = `download_${timestamp}`;
    console.log('Generated new download ID:', downloadId, 'with timestamp:', timestamp);
  }
  
  const videoFile = path.join(tempDir, `video_${timestamp}.mp4`);
  const audioFile = path.join(tempDir, `audio_${timestamp}.mp4`);
  const outputFile = path.join(tempDir, `output_${timestamp}.mp4`);
  
  // Initialize progress tracking
  downloadProgress.set(downloadId, {
    total: 100,
    downloaded: 0,
    percentage: 0,
    status: 'initializing',
    stage: 'Préparation du téléchargement...'
  });
  
  try {
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log('Created temp directory:', tempDir);
    }
    
    console.log(`\n=== FFmpeg Merge Process ===`);
    console.log(`Download ID: ${downloadId}`);
    console.log(`Video format: ${videoFormat.itag} (${videoFormat.qualityLabel})`);
    console.log(`Audio format: ${audioFormat.itag} (${audioFormat.audioBitrate}kbps)`);
    console.log(`Video file: ${videoFile}`);
    console.log(`Audio file: ${audioFile}`);
    console.log(`Output file: ${outputFile}`);
    
    // Set response headers for download
    const filename = `${sanitizedTitle}_${videoFormat.qualityLabel}.mp4`;
    const safeFilename = filename.replace(/["\\]/g, '');
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('X-Suggested-Filename', filename);
    res.setHeader('X-Download-ID', downloadId);
    
    // Add headers to prevent timeout during long FFmpeg process
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=300, max=1000');
    res.setTimeout(300000); // 5 minutes timeout
    
    console.log('Download headers set for merged file:', filename);
    console.log('Progress tracking ID:', downloadId);
    
    // Download video stream to temp file
    console.log('\n--- Downloading Video Stream ---');
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      status: 'downloading',
      stage: 'Téléchargement vidéo...',
      percentage: 10
    });
    
    // Add proper options for video-only download with enhanced bot detection bypass
    const videoOptions = getEnhancedYtdlOptions({
      format: videoFormat.itag,
      filter: 'videoonly'
    });
    
    console.log('Video download options:', videoOptions);
    const videoStream = await createYtdlStreamWithRetry(url, videoOptions);
    const videoWriteStream = fs.createWriteStream(videoFile);
    
    let videoDownloaded = 0;
    let videoTotal = 0;
    
    videoStream.on('info', (info, format) => {
      videoTotal = parseInt(format.contentLength) || 0;
    });
    
    videoStream.on('data', (chunk) => {
      videoDownloaded += chunk.length;
      if (videoTotal > 0) {
        const videoProgress = Math.floor((videoDownloaded / videoTotal) * 30); // 30% for video
        downloadProgress.set(downloadId, {
          ...downloadProgress.get(downloadId),
          percentage: 10 + videoProgress
        });
      }
    });
    
    await new Promise((resolve, reject) => {
      videoStream.pipe(videoWriteStream);
      videoStream.on('error', reject);
      videoWriteStream.on('error', reject);
      videoWriteStream.on('finish', () => {
        console.log('Video download completed:', videoFile);
        downloadProgress.set(downloadId, {
          ...downloadProgress.get(downloadId),
          percentage: 40,
          stage: 'Vidéo téléchargée'
        });
        resolve();
      });
    });
    
    // Download audio stream to temp file
    console.log('\n--- Downloading Audio Stream ---');
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      stage: 'Téléchargement audio...',
      percentage: 45
    });
    
    // Add proper options for audio-only download with enhanced bot detection bypass
    const audioOptions = getEnhancedYtdlOptions({
      format: audioFormat.itag,
      filter: 'audioonly'
    });
    
    console.log('Audio download options:', audioOptions);
    const audioStream = await createYtdlStreamWithRetry(url, audioOptions);
    const audioWriteStream = fs.createWriteStream(audioFile);
    
    let audioDownloaded = 0;
    let audioTotal = 0;
    
    audioStream.on('info', (info, format) => {
      audioTotal = parseInt(format.contentLength) || 0;
    });
    
    audioStream.on('data', (chunk) => {
      audioDownloaded += chunk.length;
      if (audioTotal > 0) {
        const audioProgress = Math.floor((audioDownloaded / audioTotal) * 25); // 25% for audio
        downloadProgress.set(downloadId, {
          ...downloadProgress.get(downloadId),
          percentage: 45 + audioProgress
        });
      }
    });
    
    await new Promise((resolve, reject) => {
      audioStream.pipe(audioWriteStream);
      audioStream.on('error', reject);
      audioWriteStream.on('error', reject);
      audioWriteStream.on('finish', () => {
        console.log('Audio download completed:', audioFile);
        downloadProgress.set(downloadId, {
          ...downloadProgress.get(downloadId),
          percentage: 70,
          stage: 'Audio téléchargé'
        });
        resolve();
      });
    });
    
    // Check file sizes before merging
    console.log('\n--- Checking Downloaded Files ---');
    const videoStats = fs.statSync(videoFile);
    const audioStats = fs.statSync(audioFile);
    console.log(`Video file size: ${videoStats.size} bytes`);
    console.log(`Audio file size: ${audioStats.size} bytes`);
    
    if (audioStats.size === 0) {
      throw new Error('Audio file is empty - format 140 may not be available for this video');
    }
    
    // Merge using FFmpeg
    console.log('\n--- Merging with FFmpeg ---');
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      stage: 'Fusion vidéo/audio...',
      percentage: 75
    });
    
    try {
      await mergeVideoAudio(videoFile, audioFile, outputFile, downloadId);
    } catch (ffmpegError) {
      console.error('FFmpeg merge failed:', ffmpegError.message);
      downloadProgress.set(downloadId, {
        ...downloadProgress.get(downloadId),
        status: 'error',
        stage: 'Erreur de conversion FFmpeg',
        percentage: 75,
        error: ffmpegError.message
      });
      throw ffmpegError;
    }
    
    console.log('FFmpeg merge completed successfully');
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      stage: 'Fusion terminée',
      percentage: 90
    });
    
    // Mark merge as completed and store file path for later download
    console.log('\n--- FFmpeg Merge Completed ---');
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      status: 'completed',
      stage: 'Téléchargement terminé',
      percentage: 100,
      filePath: outputFile, // Store file path for download endpoint
      filename: filename // Store the proper filename for download
    });
    
    console.log('FFmpeg merge completed, file ready for download:', outputFile);
    
    // Set response headers to indicate completion
    res.setHeader('X-Download-ID', downloadId);
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      downloadId: downloadId,
      message: 'FFmpeg merge completed successfully'
    });
    
    // Schedule fallback cleanup after 5 minutes (files should be cleaned immediately after download)
    setTimeout(() => {
      console.log('Running fallback cleanup for FFmpeg files...');
      cleanupAfterDownload(downloadId, [videoFile, audioFile, outputFile]);
    }, 300000); // 5 minutes
    
  } catch (error) {
    console.error('FFmpeg merge error:', error);
    
    // Update progress to show error
    downloadProgress.set(downloadId, {
      ...downloadProgress.get(downloadId),
      status: 'error',
      stage: 'Erreur lors du traitement'
    });
    
    // Clean up temp files on error using centralized function
    cleanupAfterDownload(downloadId, [videoFile, audioFile, outputFile]);
    
    if (!res.headersSent) {
      res.status(500).send('Failed to merge video and audio streams: ' + error.message);
    }
  }
}
 


// Cleanup function for temporary files
function cleanupTempFiles() {
  const tempDir = path.join(process.cwd(), 'temp');
  
  if (!fs.existsSync(tempDir)) {
    console.log('Temp directory does not exist, skipping cleanup');
    return;
  }
  
  try {
    const files = fs.readdirSync(tempDir);
    let cleanedCount = 0;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const now = Date.now();
      const fileAge = now - stats.mtime.getTime();
      
      // Clean files older than 10 minutes (600000 ms)
      if (fileAge > 600000) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up old temp file: ${file}`);
          cleanedCount++;
        } catch (err) {
          console.error(`Error cleaning up file ${file}:`, err.message);
        }
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Cleanup completed: ${cleanedCount} old temp files removed`);
    } else {
      console.log('Cleanup completed: no old temp files found');
    }
  } catch (err) {
    console.error('Error during temp files cleanup:', err.message);
  }
}

// Function to clean up files after regular download completion
function cleanupAfterDownload(downloadId, tempFiles = []) {
  console.log(`Starting cleanup for download ${downloadId}`);
  
  // Clean up any temp files if provided
  tempFiles.forEach(filePath => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (err) {
      console.error(`Error cleaning up temp file ${filePath}:`, err.message);
    }
  });
  
  // Remove from progress tracking if exists
  if (downloadProgress.has(downloadId)) {
    downloadProgress.delete(downloadId);
    console.log(`Progress tracking cleaned up for: ${downloadId}`);
  }
}

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Optional proxy configuration for enhanced bot detection bypass
const PROXY_URL = process.env.PROXY_URL; // Optional: http://username:password@proxy-server:port
const USE_IPV6 = process.env.USE_IPV6 === 'true';
const ENABLE_COOKIES = process.env.ENABLE_COOKIES !== 'false'; // Default to true
const YTDL_NO_UPDATE = process.env.YTDL_NO_UPDATE || 'true'; // Disable update checks to avoid 403

// Set environment variable to disable ytdl-core update checks
process.env.YTDL_NO_UPDATE = YTDL_NO_UPDATE;

console.log('🔧 Server Configuration:');
console.log('- Port:', PORT);
console.log('- Frontend URL:', FRONTEND_URL);
console.log('- Environment:', process.env.NODE_ENV || 'development');
console.log('- Proxy URL:', PROXY_URL ? '[CONFIGURED]' : '[NOT SET]');
console.log('- IPv6 Support:', USE_IPV6);
console.log('- Cookies Enabled:', ENABLE_COOKIES);
console.log('- YTDL Update Check Disabled:', YTDL_NO_UPDATE);

// Clean up old temp files on server startup
console.log('Starting server cleanup...');
cleanupTempFiles();

// Schedule periodic cleanup every 30 minutes
setInterval(cleanupTempFiles, 30 * 60 * 1000);
console.log('Scheduled periodic temp file cleanup every 30 minutes');

// Use CORS to allow requests from the frontend, which runs on a different port.
// Logging middleware
app.use((req, res, next) => {
  console.log(`Request Method: ${req.method}, Request URL: ${req.originalUrl}`);
  next();
});

// Progress tracking endpoint
app.get('/api/progress/:downloadId', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Content-Type', 'application/json');
  
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  res.json({
    total: progress.total,
    downloaded: progress.downloaded,
    percentage: progress.percentage,
    status: progress.status,
    stage: progress.stage
  });
});

// FFmpeg file download endpoint
app.get('/api/download-file/:downloadId', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  
  const { downloadId } = req.params;
  const progress = downloadProgress.get(downloadId);
  
  if (!progress) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  if (progress.status !== 'completed' || !progress.filePath) {
    return res.status(400).json({ error: 'File not ready for download' });
  }
  
  const filePath = progress.filePath;
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  try {
    const stat = fs.statSync(filePath);
    // Use the stored filename from progress data, fallback to basename if not available
    const filename = progress.filename || path.basename(filePath);
    
    // Set headers for file download
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log('Using filename for download:', filename);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    console.log('Serving FFmpeg merged file:', filePath);
    
    // Clean up temp files immediately after download completes
    fileStream.on('end', () => {
      console.log('FFmpeg file download completed, cleaning up temp files...');
      
      // Extract timestamp from the output file to find related temp files
      const timestamp = path.basename(filePath).replace('output_', '').replace('.mp4', '');
      const tempDir = path.dirname(filePath);
      const videoFile = path.join(tempDir, `video_${timestamp}.mp4`);
      const audioFile = path.join(tempDir, `audio_${timestamp}.mp4`);
      
      // Use the centralized cleanup function
      cleanupAfterDownload(downloadId, [videoFile, audioFile, filePath]);
    });
    
    // Handle stream errors and cleanup
    fileStream.on('error', (streamError) => {
      console.error('File stream error:', streamError);
      
      // Extract timestamp and cleanup on error
      const timestamp = path.basename(filePath).replace('output_', '').replace('.mp4', '');
      const tempDir = path.dirname(filePath);
      const videoFile = path.join(tempDir, `video_${timestamp}.mp4`);
      const audioFile = path.join(tempDir, `audio_${timestamp}.mp4`);
      
      cleanupAfterDownload(downloadId, [videoFile, audioFile, filePath]);
      
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
    
    // Handle response close/abort during streaming
    res.on('close', () => {
      console.log('FFmpeg file download connection closed');
      
      // Extract timestamp and cleanup if connection closed
      const timestamp = path.basename(filePath).replace('output_', '').replace('.mp4', '');
      const tempDir = path.dirname(filePath);
      const videoFile = path.join(tempDir, `video_${timestamp}.mp4`);
      const audioFile = path.join(tempDir, `audio_${timestamp}.mp4`);
      
      cleanupAfterDownload(downloadId, [videoFile, audioFile, filePath]);
    });
    
    // Handle response errors
    res.on('error', (resError) => {
      console.error('FFmpeg file download response error:', resError);
      
      // Extract timestamp and cleanup on error
      const timestamp = path.basename(filePath).replace('output_', '').replace('.mp4', '');
      const tempDir = path.dirname(filePath);
      const videoFile = path.join(tempDir, `video_${timestamp}.mp4`);
      const audioFile = path.join(tempDir, `audio_${timestamp}.mp4`);
      
      cleanupAfterDownload(downloadId, [videoFile, audioFile, filePath]);
    });
    
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Error serving file' });
  }
});

// Explicit CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Download-ID', 'x-download-id'],
  exposedHeaders: ['X-Download-ID'],
  credentials: false
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', FRONTEND_URL);
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Download-ID, x-download-id');
  res.header('Access-Control-Expose-Headers', 'X-Download-ID');
  res.status(200).end();
});

// Enhanced endpoint to get video info with formats and thumbnail
app.get('/api/info', async (req, res) => {
  console.log('Info endpoint hit with URL:', req.query.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');
  
  const { url } = req.query;

  if (!url || !ytdl.validateURL(String(url))) {
    console.log('Invalid URL provided:', url);
    return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
  }

  try {
    console.log('Getting video info for:', url);
    const info = await getVideoInfoWithRetry(String(url));
    const title = info.videoDetails.title;
    const thumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1]?.url || '';
    console.log('Video title:', title);
    
    // Sanitize the title to create a valid filename
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Keep letters, numbers, spaces, hyphens, underscores
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 100); // Limit length to 100 characters
    
    // Get available formats
    const formats = info.formats;
    
    // Filter and organize audio formats for MP3
    const audioFormats = formats
      .filter(format => format.hasAudio && !format.hasVideo)
      .map(format => ({
        itag: format.itag,
        quality: format.audioBitrate ? `${format.audioBitrate}kbps` : format.quality || 'unknown',
        qualityLabel: format.qualityLabel,
        container: format.container,
        hasVideo: false,
        hasAudio: true,
        audioCodec: format.audioCodec,
        filesize: format.contentLength ? parseInt(format.contentLength) : undefined
      }))
      .sort((a, b) => {
        const aQuality = parseInt(a.quality) || 0;
        const bQuality = parseInt(b.quality) || 0;
        return bQuality - aQuality;
      });
    
    // Log available audio formats and their IDs
    console.log('=== AUDIO FORMATS AVAILABLE ===');
    if (audioFormats.length > 0) {
      audioFormats.forEach(format => {
        console.log(`Audio ID: ${format.itag}, Quality: ${format.quality}, Container: ${format.container}, Codec: ${format.audioCodec}`);
      });
    } else {
      console.log('No audio-only formats found for this video');
    }
    console.log('=== END AUDIO FORMATS ===');
    
    // Filter and organize video formats for MP4
    // Include both video+audio combined formats AND video-only formats
    const videoWithAudioFormats = formats
      .filter(format => format.hasVideo && format.hasAudio)
      .map(format => ({
        itag: format.itag,
        quality: format.qualityLabel || format.quality || 'unknown',
        qualityLabel: format.qualityLabel,
        container: format.container,
        hasVideo: true,
        hasAudio: true,
        videoCodec: format.videoCodec,
        audioCodec: format.audioCodec,
        filesize: format.contentLength ? parseInt(format.contentLength) : undefined
      }));
    
    // Get video-only formats for higher qualities
    const videoOnlyFormats = formats
      .filter(format => format.hasVideo && !format.hasAudio && format.container === 'mp4')
      .map(format => ({
        itag: format.itag,
        quality: format.qualityLabel || format.quality || 'unknown',
        qualityLabel: format.qualityLabel,
        container: format.container,
        hasVideo: true,
        hasAudio: false, // Will need to be combined with audio
        videoCodec: format.videoCodec,
        audioCodec: null,
        filesize: format.contentLength ? parseInt(format.contentLength) : undefined
      }));
    
    // Combine all video formats
    const allVideoFormats = [...videoWithAudioFormats, ...videoOnlyFormats]
      .filter((format, index, self) => {
        // Remove duplicates based on quality
        return index === self.findIndex(f => f.quality === format.quality);
      })
      .sort((a, b) => {
        const qualityOrder = { '2160p': 6, '1440p': 5, '1080p': 4, '720p': 3, '480p': 2, '360p': 1, '240p': 0 };
        const aQuality = qualityOrder[a.quality] || qualityOrder[a.qualityLabel] || 0;
        const bQuality = qualityOrder[b.quality] || qualityOrder[b.qualityLabel] || 0;
        return bQuality - aQuality;
      });
    
    const videoFormats = allVideoFormats;
    
    const availableFormats = [...audioFormats, ...videoFormats];
    
    res.json({
      title: title,
      filename: sanitizedTitle || 'youtube-media',
      duration: info.videoDetails.lengthSeconds,
      thumbnail: thumbnail,
      availableFormats: availableFormats
    });
    
  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: 'Failed to get video information' });
  }
});

// OPTIONS endpoint for CORS preflight
app.options('/api/download', (req, res) => {
  console.log('OPTIONS request to download endpoint');
  
  // Set CORS headers for preflight
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Download-ID, x-download-id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Download-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  
  console.log('CORS preflight headers set');
  res.status(200).end();
});

// HEAD endpoint for download to provide download ID without starting download
app.head('/api/download', async (req, res) => {
  console.log('HEAD request to download endpoint with URL:', req.query.url);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Download-ID, x-download-id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Download-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  console.log('CORS headers set for HEAD request with X-Download-ID exposure');
  
  const { url, format = 'mp3', quality, itag } = req.query;

  if (!url || !ytdl.validateURL(String(url))) {
    console.log('Invalid URL provided:', url);
    return res.status(400).end();
  }

  try {
    // Get video info to check if FFmpeg merge will be needed
    const info = await getVideoInfoWithRetry(String(url));
    const availableFormats = info.formats;
    
    // Check if this will require FFmpeg merge
    let needsFFmpegMerge = false;
    if (format === 'mp4' && itag) {
      const requestedFormat = availableFormats.find(f => f.itag == itag);
      if (requestedFormat && requestedFormat.hasVideo && !requestedFormat.hasAudio && 
          (requestedFormat.qualityLabel === '1080p' || requestedFormat.qualityLabel === '720p')) {
        const ffmpegAvailable = await checkFFmpegAvailability();
        if (ffmpegAvailable) {
          needsFFmpegMerge = true;
        }
      }
    }
    
    // If FFmpeg merge is needed, generate and return download ID
    if (needsFFmpegMerge) {
      const downloadId = `download_${Date.now()}`;
      console.log('HEAD request: Will need FFmpeg merge, providing download ID:', downloadId);
      res.setHeader('X-Download-ID', downloadId);
    }
    
    res.status(200).end();
    
  } catch (error) {
    console.error('Error in HEAD request:', error);
    res.status(500).end();
  }
});

app.get('/api/download', async (req, res) => {
  console.log('Download endpoint hit with URL:', req.query.url);
  
  // Set CORS headers IMMEDIATELY before any processing
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_URL);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Download-ID, x-download-id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Download-ID');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  
  console.log('CORS headers set immediately with X-Download-ID exposure');
  
  const { url, format = 'mp3', quality, itag } = req.query;

  if (!url || !ytdl.validateURL(String(url))) {
    console.log('Invalid URL provided:', url);
    return res.status(400).send('Invalid or missing YouTube URL');
  }

  try {
    console.log('Getting video info for:', url);
    console.log('Requested format:', format, 'quality:', quality, 'itag:', itag);
    
    // Get video info to set a nice filename for the download.
    const info = await ytdl.getInfo(String(url));
    const title = info.videoDetails.title;
    console.log('Video title:', title);
    
    // Sanitize the title to create a valid filename.
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Keep letters, numbers, spaces, hyphens, underscores
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 100); // Limit length to 100 characters
    
    console.log('Original title:', title);
    console.log('Sanitized filename:', sanitizedTitle);

    // Determine file extension and content type based on format
    const fileExtension = format === 'mp4' ? 'mp4' : 'mp3';
    const contentType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
    
    // Set headers to trigger a download in the browser.
    const filename = sanitizedTitle || 'youtube-media';
    const safeFilename = filename.replace(/["\\]/g, ''); // Remove quotes and backslashes for header safety
    const fullFilename = `${safeFilename}.${fileExtension}`;
    
    // Anti-download-manager headers to force browser-native downloads
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, nosnippet, noarchive');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    
    // Use RFC 6266 compliant Content-Disposition header with UTF-8 encoding
    const encodedFilename = encodeURIComponent(fullFilename);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${fileExtension}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Type', 'application/force-download'); // Force download type to bypass IDM
    res.setHeader('Content-Transfer-Encoding', 'binary');
    res.setHeader('X-Suggested-Filename', fullFilename); // Fallback header for browsers
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '-1');
    
    console.log('Download headers set with filename:', fullFilename);
    console.log('Content-Disposition header:', `attachment; filename="${safeFilename}.${fileExtension}"; filename*=UTF-8''${encodedFilename}`);
    console.log('X-Suggested-Filename header:', fullFilename);

    console.log('Starting stream...');
    
    // Get video info to check format capabilities
    const videoInfo = await ytdl.getInfo(String(url));
    const availableFormats = videoInfo.formats;
    
    // Debug: Log available formats with audio
    console.log('Available combined formats (video+audio):');
    availableFormats
      .filter(f => f.hasVideo && f.hasAudio)
      .forEach(f => {
        console.log(`Format ${f.itag}: ${f.qualityLabel || f.quality} ${f.container} - Video: ${f.videoCodec}, Audio: ${f.audioCodec}`);
      });
    
    // Configure ytdl options to prioritize combined formats with audio
    let ytdlOptions = {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      }
    };
    
    if (format === 'mp4') {
      // Check if specific itag was requested
      if (itag) {
        const requestedFormat = availableFormats.find(f => f.itag == itag);
        
        if (requestedFormat) {
          console.log(`Requested format ${itag}: ${requestedFormat.qualityLabel} - hasVideo: ${requestedFormat.hasVideo}, hasAudio: ${requestedFormat.hasAudio}`);
          
          // If requested format has no audio, try FFmpeg merging for high quality
          if (requestedFormat.hasVideo && !requestedFormat.hasAudio && (requestedFormat.qualityLabel === '1080p' || requestedFormat.qualityLabel === '720p')) {
            console.log(`Format ${itag} (${requestedFormat.qualityLabel}) has no audio, checking FFmpeg availability...`);
            
            const ffmpegAvailable = await checkFFmpegAvailability();
            if (ffmpegAvailable) {
              console.log('FFmpeg available, attempting to merge video and audio streams');
              
              // Find best audio format with better fallback logic
              console.log('=== AUDIO FORMAT SELECTION FOR DOWNLOAD ===');
              const audioFormats = availableFormats.filter(f => f.hasAudio && !f.hasVideo);
              console.log('Available audio-only formats:', audioFormats.map(f => `ID:${f.itag} Quality:${f.audioBitrate}kbps Container:${f.container} Codec:${f.audioCodec}`));
              
              // Try to find audio formats in order of preference
              let audioFormat = null;
              let selectedReason = '';
              
              // First try: m4a audio (itag 140)
              audioFormat = availableFormats.find(f => f.itag === 140);
              if (audioFormat) {
                selectedReason = 'Found preferred m4a audio (itag 140)';
              } else {
                console.log('❌ m4a audio (itag 140) not available');
                
                // Second try: webm audio (itag 251)
                audioFormat = availableFormats.find(f => f.itag === 251);
                if (audioFormat) {
                  selectedReason = 'Found webm audio (itag 251)';
                } else {
                  console.log('❌ webm audio (itag 251) not available');
                  
                  // Third try: webm audio (itag 250)
                  audioFormat = availableFormats.find(f => f.itag === 250);
                  if (audioFormat) {
                    selectedReason = 'Found webm audio (itag 250)';
                  } else {
                    console.log('❌ webm audio (itag 250) not available');
                    
                    // Fourth try: any mp4 audio-only
                    audioFormat = availableFormats.find(f => f.hasAudio && !f.hasVideo && f.container === 'mp4');
                    if (audioFormat) {
                      selectedReason = `Found mp4 audio-only (itag ${audioFormat.itag})`;
                    } else {
                      console.log('❌ No mp4 audio-only formats available');
                      
                      // Last try: any audio-only format
                      audioFormat = availableFormats.find(f => f.hasAudio && !f.hasVideo);
                      if (audioFormat) {
                        selectedReason = `Found any audio-only (itag ${audioFormat.itag}, container: ${audioFormat.container})`;
                      } else {
                        console.log('❌ No audio-only formats available at all');
                      }
                    }
                  }
                }
              }
              
              if (audioFormat) {
                console.log(`✅ ${selectedReason}`);
                console.log(`Selected audio format: ID:${audioFormat.itag} Quality:${audioFormat.audioBitrate}kbps Container:${audioFormat.container} Codec:${audioFormat.audioCodec}`);
                console.log(`Using video format ${requestedFormat.itag} (${requestedFormat.qualityLabel}) + audio format ${audioFormat.itag}`);
                console.log('=== END AUDIO FORMAT SELECTION ===');
                // Check if downloadId was provided in X-Download-ID header
                const providedDownloadId = req.headers['x-download-id'];
                console.log('Received X-Download-ID header:', providedDownloadId);
                console.log('All request headers:', req.headers);
                return await handleFFmpegMergeNew(req, res, String(url), requestedFormat, audioFormat, sanitizedTitle, providedDownloadId);
              } else {
                console.log('❌ No suitable audio format found for merging');
                console.log('=== END AUDIO FORMAT SELECTION ===');
              }
            } else {
              console.log('FFmpeg not available, falling back to combined format');
            }
          } else if (requestedFormat.hasVideo && requestedFormat.hasAudio) {
            // Use the requested combined format
            ytdlOptions.format = requestedFormat.itag;
            console.log('Using requested combined format:', requestedFormat.itag, requestedFormat.qualityLabel);
          }
        }
      }
      
      // If no specific itag or fallback needed, prioritize combined formats
      if (!ytdlOptions.format) {
        const combinedFormats = availableFormats
          .filter(f => f.hasVideo && f.hasAudio && f.container === 'mp4')
          .sort((a, b) => {
            // Sort by quality (height) descending
            const aHeight = parseInt(a.qualityLabel) || 0;
            const bHeight = parseInt(b.qualityLabel) || 0;
            return bHeight - aHeight;
          });
        
        console.log('Available MP4 combined formats:', combinedFormats.map(f => `${f.itag}:${f.qualityLabel}:${f.audioCodec}`));
        
        if (combinedFormats.length > 0) {
          const selectedFormat = combinedFormats[0];
          ytdlOptions.format = selectedFormat.itag;
          console.log('Using best combined format:', selectedFormat.itag, selectedFormat.qualityLabel, 'Audio:', selectedFormat.audioCodec);
        } else {
          // No MP4 combined formats, try any combined format
          const anyCombined = availableFormats.filter(f => f.hasVideo && f.hasAudio);
          if (anyCombined.length > 0) {
            const selectedFormat = anyCombined[0];
            ytdlOptions.format = selectedFormat.itag;
            console.log('Using any combined format:', selectedFormat.itag, selectedFormat.qualityLabel, 'Audio:', selectedFormat.audioCodec);
          } else {
            // Last resort - use filter with explicit quality
            ytdlOptions.quality = 'highest';
            ytdlOptions.filter = f => f.hasVideo && f.hasAudio;
            console.log('Using filter for combined formats with highest quality');
          }
        }
      }
      
      // Apply enhanced bot detection bypass configuration
      ytdlOptions = getEnhancedYtdlOptions(ytdlOptions);
    } else {
      // For MP3, we want audio only
      if (itag) {
        // Validate that the requested itag is actually an audio-only format
        const requestedFormat = availableFormats.find(f => f.itag == itag);
        if (requestedFormat && requestedFormat.hasAudio && !requestedFormat.hasVideo) {
          console.log(`Using requested audio format ${itag}: ${requestedFormat.audioBitrate}kbps ${requestedFormat.container}`);
          ytdlOptions.format = itag;
        } else {
          console.log(`WARNING: Requested format ${itag} is not a valid audio-only format, falling back to best audio`);
          // Find best available audio format
          const audioFormats = availableFormats
            .filter(f => f.hasAudio && !f.hasVideo)
            .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
          
          if (audioFormats.length > 0) {
            const bestAudio = audioFormats[0];
            console.log(`Selected best audio format: ${bestAudio.itag} (${bestAudio.audioBitrate}kbps ${bestAudio.container})`);
            ytdlOptions.format = bestAudio.itag;
          } else {
            console.log('No audio-only formats found, using filter fallback');
            ytdlOptions.quality = 'highestaudio';
            ytdlOptions.filter = 'audioonly';
          }
        }
      } else {
        // No specific itag requested, find best audio format
        const audioFormats = availableFormats
          .filter(f => f.hasAudio && !f.hasVideo)
          .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        
        if (audioFormats.length > 0) {
          const bestAudio = audioFormats[0];
          console.log(`Auto-selected best audio format: ${bestAudio.itag} (${bestAudio.audioBitrate}kbps ${bestAudio.container})`);
          ytdlOptions.format = bestAudio.itag;
        } else {
          console.log('No audio-only formats found, using filter fallback');
          ytdlOptions.quality = 'highestaudio';
          ytdlOptions.filter = 'audioonly';
        }
      }
    }
    
    console.log('YTDL options:', ytdlOptions);
    
    // Try to explicitly choose the format before streaming
    let chosenFormat;
    try {
      if (ytdlOptions.format) {
        // Find the specific format we want
        chosenFormat = availableFormats.find(f => f.itag === ytdlOptions.format);
        if (chosenFormat) {
          console.log('Explicitly chosen format:', chosenFormat.itag, 'hasAudio:', chosenFormat.hasAudio, 'hasVideo:', chosenFormat.hasVideo);
          console.log('Chosen format audio codec:', chosenFormat.audioCodec, 'video codec:', chosenFormat.videoCodec);
        } else {
          console.log('WARNING: Requested format', ytdlOptions.format, 'not found in available formats');
          // If format not found and this is MP3, force fallback to audio-only filter
          if (format === 'mp3') {
            console.log('Forcing fallback to audio-only filter for MP3');
            delete ytdlOptions.format;
            ytdlOptions.quality = 'highestaudio';
            ytdlOptions.filter = 'audioonly';
          }
        }
      }
    } catch (error) {
      console.log('Error choosing format:', error.message);
    }
    
    // Always use direct streaming without FFmpeg for production reliability
    // Create a readable stream from ytdl and pipe it to the response.
    let stream;
    if (chosenFormat) {
      // Use the explicitly chosen format object with enhanced options
      console.log('Creating stream with explicit format object');
      const enhancedOptions = getEnhancedYtdlOptions({ 
        ...ytdlOptions, 
        format: chosenFormat 
      });
      stream = await createYtdlStreamWithRetry(String(url), enhancedOptions);
    } else {
      console.log('Creating stream with filter/quality options');
      const enhancedOptions = getEnhancedYtdlOptions(ytdlOptions);
      stream = await createYtdlStreamWithRetry(String(url), enhancedOptions);
    }
    
    let dataReceived = false;
    
    stream.on('info', (info, selectedFormat) => {
      console.log('Stream info received:', selectedFormat.container, selectedFormat.audioCodec, selectedFormat.videoCodec);
      console.log('Selected quality:', selectedFormat.qualityLabel || selectedFormat.quality);
      console.log('Format details - itag:', selectedFormat.itag, 'hasAudio:', selectedFormat.hasAudio, 'hasVideo:', selectedFormat.hasVideo);
      console.log('Audio bitrate:', selectedFormat.audioBitrate, 'Video bitrate:', selectedFormat.bitrate);
      
      // Check if this is actually a combined format by examining the original format info
      const originalFormat = availableFormats.find(f => f.itag === selectedFormat.itag);
      if (originalFormat) {
        console.log('Original format info - Audio codec:', originalFormat.audioCodec, 'Video codec:', originalFormat.videoCodec);
        console.log('Original hasAudio:', originalFormat.hasAudio, 'hasVideo:', originalFormat.hasVideo);
      }
    });
    
    stream.on('data', (chunk) => {
      if (!dataReceived) {
        console.log('First data chunk received, size:', chunk.length);
        dataReceived = true;
      }
    });
    

    
    // Generate a download ID for tracking and cleanup
    const downloadId = `direct_${Date.now()}`;
    
    stream.on('end', () => {
      console.log('Stream ended successfully');
      // Clean up after successful download
      cleanupAfterDownload(downloadId);
    });
    
    res.on('close', () => {
      console.log('Response connection closed');
      // Clean up if connection was closed prematurely
      cleanupAfterDownload(downloadId);
    });
    
    res.on('error', (error) => {
      console.error('Response error:', error.message);
      // Clean up on error
      cleanupAfterDownload(downloadId);
    });
    
    stream.on('error', (error) => {
      console.error('Stream error during download:', error.message);
      // Clean up on stream error
      cleanupAfterDownload(downloadId);
      if (error.message.includes('403') || error.message.includes('Forbidden')) {
        console.log('YouTube 403 error detected, this video may be restricted or require different access methods');
        if (!res.headersSent) {
          res.status(403).send('Video access restricted. This may be due to YouTube\'s anti-bot measures or regional restrictions.');
        }
      } else {
        if (!res.headersSent) {
          res.status(500).send('Stream error occurred: ' + error.message);
        }
      }
    });
    
    stream.pipe(res);
    console.log('Stream piped to response with download ID:', downloadId);

  } catch (error) {
    console.error('Error processing download:', error);
    if (!res.headersSent) {
      res.status(500).send('Failed to process download. It might be private, age-restricted, or an invalid link.');
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend server running at http://localhost:${PORT}`);
});