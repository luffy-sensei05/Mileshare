#!/usr/bin/env python3
"""
Beautiful Web-based Image Downloader
Flask backend for the image downloader with modern web UI
"""

import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import requests
import os
from urllib.parse import urlparse
from pathlib import Path
import re
from PIL import Image
import tempfile
import threading
import uuid
from datetime import datetime
import zipfile

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Store active downloads
active_downloads = {}

class DownloadManager:
    def __init__(self, download_id):
        self.download_id = download_id
        self.is_downloading = False
        self.progress = 0
        self.total = 0
        self.current_file = ""
        self.status = "ready"
        
    def emit_progress(self, message, progress=None, status=None, filename=None):
        """Emit progress update to client"""
        if progress is not None:
            self.progress = progress
        if status is not None:
            self.status = status
            
        payload = {
            'download_id': self.download_id,
            'message': message,
            'progress': self.progress,
            'total': self.total,
            'status': self.status,
            'timestamp': datetime.now().strftime("%H:%M:%S")
        }
        
        if filename:
            payload['filename'] = filename
            
        socketio.emit('download_progress', payload)

@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@app.route('/api/download/single', methods=['POST'])
def download_single():
    """Download single image"""
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    if not url.startswith(('http://', 'https://')):
        return jsonify({'error': 'URL must start with http:// or https://'}), 400
    
    download_id = str(uuid.uuid4())
    manager = DownloadManager(download_id)
    active_downloads[download_id] = manager
    
    # Start download in background
    thread = threading.Thread(target=download_single_worker, args=(manager, url))
    thread.daemon = True
    thread.start()
    
    return jsonify({'download_id': download_id})

@app.route('/api/download/batch', methods=['POST'])
def download_batch():
    """Download batch images and convert to PDF or ZIP"""
    data = request.get_json()
    start_url = data.get('start_url', '').strip()
    end_url = data.get('end_url', '').strip()
    output_name = data.get('output_name', 'downloaded_document').strip()
    output_format = data.get('output_format', 'pdf').strip()
    
    if not start_url or not end_url:
        return jsonify({'error': 'Both start and end URLs are required'}), 400
    
    if output_format not in ['pdf', 'zip']:
        return jsonify({'error': 'Invalid output format. Must be pdf or zip'}), 400
    
    download_id = str(uuid.uuid4())
    manager = DownloadManager(download_id)
    active_downloads[download_id] = manager
    
    # Start download in background
    thread = threading.Thread(target=download_batch_worker, args=(manager, start_url, end_url, output_name, output_format))
    thread.daemon = True
    thread.start()
    
    return jsonify({'download_id': download_id})

def download_single_worker(manager, url):
    """Worker for single image download"""
    try:
        manager.is_downloading = True
        manager.total = 1
        manager.emit_progress("Starting download...", 0, "downloading")
        
        Path("./downloads").mkdir(exist_ok=True)
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        filename = os.path.basename(urlparse(url).path) or "image.jpg"
        filepath = os.path.join("./downloads", filename)
        
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        manager.emit_progress(f"✅ Image saved: {filename}", 1, "completed", filename)
        
    except Exception as e:
        manager.emit_progress(f"❌ Download failed: {str(e)}", 0, "error")
    finally:
        manager.is_downloading = False

def download_batch_worker(manager, start_url, end_url, output_name, output_format):
    """Worker for batch download and PDF/ZIP conversion"""
    try:
        manager.is_downloading = True
        manager.emit_progress("Analyzing URLs...", 0, "downloading")
        
        # Extract pattern and range
        url_template, start_num, end_num = extract_url_pattern(start_url, end_url)
        
        if start_num > end_num:
            manager.emit_progress("❌ Start number should be less than end number", 0, "error")
            return
        
        total_pages = end_num - start_num + 1
        manager.total = total_pages
        
        manager.emit_progress(f"📚 Downloading {total_pages} pages...", 0, "downloading")
        
        # Create temporary directory
        with tempfile.TemporaryDirectory() as temp_dir:
            downloaded_images = []
            
            # Download all images
            for i, page_num in enumerate(range(start_num, end_num + 1)):
                current_url = url_template.format(page_num)
                filename = os.path.basename(urlparse(current_url).path)
                
                manager.emit_progress(f"📥 Downloading {filename} ({i+1}/{total_pages})", i, "downloading")
                
                temp_path = download_image_to_temp(current_url, temp_dir)
                downloaded_images.append(temp_path)
            
            # Filter out failed downloads
            valid_images = [img for img in downloaded_images if img is not None]
            
            if not valid_images:
                manager.emit_progress("❌ No images were downloaded successfully", 0, "error")
                return
            
            manager.emit_progress(f"✅ Downloaded {len(valid_images)}/{total_pages} images", total_pages, "converting")
            
            # Create output based on format
            Path("./downloads").mkdir(exist_ok=True)
            
            if output_format == 'pdf':
                output_filename = f"{output_name}.pdf"
                output_path = os.path.join("./downloads", output_filename)
                manager.emit_progress("📄 Converting to PDF...", total_pages, "converting")
                
                if images_to_pdf(valid_images, output_path):
                    manager.emit_progress(f"🎉 PDF created: {output_filename}", total_pages, "completed", output_filename)
                else:
                    manager.emit_progress("❌ Failed to create PDF", total_pages, "error")
            
            elif output_format == 'zip':
                output_filename = f"{output_name}.zip"
                output_path = os.path.join("./downloads", output_filename)
                manager.emit_progress("📦 Creating ZIP archive...", total_pages, "converting")
                
                if images_to_zip(valid_images, output_path):
                    manager.emit_progress(f"🎉 ZIP created: {output_filename}", total_pages, "completed", output_filename)
                else:
                    manager.emit_progress("❌ Failed to create ZIP", total_pages, "error")
                
    except Exception as e:
        manager.emit_progress(f"❌ Batch download failed: {str(e)}", 0, "error")
    finally:
        manager.is_downloading = False

def extract_url_pattern(start_url, end_url):
    """Extract the pattern and range from start and end URLs"""
    start_match = re.search(r'(\d+)(?=\.[^.]*$)', start_url)
    end_match = re.search(r'(\d+)(?=\.[^.]*$)', end_url)
    
    if not start_match or not end_match:
        raise ValueError("Could not find numeric pattern in URLs")
    
    start_num = int(start_match.group(1))
    end_num = int(end_match.group(1))
    
    # Create URL template
    url_template = start_url.replace(start_match.group(1), "{:04d}")
    
    return url_template, start_num, end_num

def download_image_to_temp(url, temp_dir):
    """Download image to temporary directory"""
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        filename = os.path.basename(urlparse(url).path)
        temp_path = os.path.join(temp_dir, filename)
        
        with open(temp_path, 'wb') as f:
            f.write(response.content)
        
        return temp_path
        
    except Exception as e:
        return None

def images_to_pdf(image_paths, output_path):
    """Convert list of image paths to PDF"""
    try:
        images = []
        
        for img_path in image_paths:
            if img_path and os.path.exists(img_path):
                img = Image.open(img_path)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                images.append(img)
        
        if images:
            images[0].save(output_path, save_all=True, append_images=images[1:])
            return True
        return False
        
    except Exception as e:
        return False

def images_to_zip(image_paths, output_path):
    """Create ZIP archive from list of image paths"""
    try:
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for img_path in image_paths:
                if img_path and os.path.exists(img_path):
                    # Get just the filename for the archive
                    arcname = os.path.basename(img_path)
                    zipf.write(img_path, arcname)
        return True
        
    except Exception as e:
        return False

@app.route('/downloads/<filename>')
def download_file(filename):
    """Serve downloaded files"""
    return send_file(os.path.join('./downloads', filename), as_attachment=True)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)