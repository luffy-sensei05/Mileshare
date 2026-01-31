// Modern JavaScript for Image Downloader Pro
class ImageDownloaderApp {
    constructor() {
        this.socket = io();
        this.currentDownloadId = null;
        this.isDownloading = false;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
    }
    
    initializeElements() {
        // Mode elements
        this.singleModeRadio = document.getElementById('single-mode');
        this.batchModeRadio = document.getElementById('batch-mode');
        this.singleForm = document.getElementById('single-form');
        this.batchForm = document.getElementById('batch-form');
        
        // Input elements
        this.singleUrlInput = document.getElementById('single-url');
        this.startUrlInput = document.getElementById('start-url');
        this.endUrlInput = document.getElementById('end-url');
        this.outputNameInput = document.getElementById('output-name');
        this.outputFormatSelect = document.getElementById('output-format');
        
        // Button elements
        this.downloadSingleBtn = document.getElementById('download-single');
        this.downloadBatchBtn = document.getElementById('download-batch');
        this.downloadFileBtn = document.getElementById('download-file-btn');
        this.downloadSection = document.getElementById('download-section');
        
        // Progress elements
        this.progressText = document.getElementById('progress-text');
        this.progressPercentage = document.getElementById('progress-percentage');
        this.progressFill = document.getElementById('progress-fill');
        
        // Log elements
        this.logContainer = document.getElementById('log-container');
        
        // Store downloaded file info
        this.downloadedFile = null;
    }
    
    bindEvents() {
        // Mode change events
        this.singleModeRadio.addEventListener('change', () => this.handleModeChange());
        this.batchModeRadio.addEventListener('change', () => this.handleModeChange());
        
        // Download button events
        this.downloadSingleBtn.addEventListener('click', () => this.handleSingleDownload());
        this.downloadBatchBtn.addEventListener('click', () => this.handleBatchDownload());
        this.downloadFileBtn.addEventListener('click', () => this.handleFileDownload());
        
        // Enter key events
        this.singleUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSingleDownload();
        });
        
        [this.startUrlInput, this.endUrlInput, this.outputNameInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleBatchDownload();
            });
        });
        
        // Input validation
        this.singleUrlInput.addEventListener('input', () => this.validateSingleForm());
        this.startUrlInput.addEventListener('input', () => this.validateBatchForm());
        this.endUrlInput.addEventListener('input', () => this.validateBatchForm());
    }
    
    setupSocketListeners() {
        this.socket.on('download_progress', (data) => {
            this.handleProgressUpdate(data);
        });
        
        this.socket.on('connect', () => {
            this.addLogEntry('🔗 Connected to server', 'success');
        });
        
        this.socket.on('disconnect', () => {
            this.addLogEntry('❌ Disconnected from server', 'error');
        });
    }
    
    handleModeChange() {
        if (this.singleModeRadio.checked) {
            this.showSingleForm();
        } else {
            this.showBatchForm();
        }
    }
    
    showSingleForm() {
        this.singleForm.style.display = 'block';
        this.batchForm.style.display = 'none';
        this.singleForm.classList.add('fade-in');
        this.validateSingleForm();
    }
    
    showBatchForm() {
        this.singleForm.style.display = 'none';
        this.batchForm.style.display = 'block';
        this.batchForm.classList.add('fade-in');
        this.validateBatchForm();
    }
    
    validateSingleForm() {
        const url = this.singleUrlInput.value.trim();
        const isValid = url && this.isValidUrl(url);
        this.downloadSingleBtn.disabled = !isValid || this.isDownloading;
    }
    
    validateBatchForm() {
        const startUrl = this.startUrlInput.value.trim();
        const endUrl = this.endUrlInput.value.trim();
        const isValid = startUrl && endUrl && this.isValidUrl(startUrl) && this.isValidUrl(endUrl);
        this.downloadBatchBtn.disabled = !isValid || this.isDownloading;
    }
    
    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }
    
    async handleSingleDownload() {
        if (this.isDownloading) return;
        
        const url = this.singleUrlInput.value.trim();
        if (!url || !this.isValidUrl(url)) {
            this.addLogEntry('❌ Please enter a valid URL', 'error');
            return;
        }
        
        this.startDownload();
        this.addLogEntry(`🚀 Starting single image download...`);
        
        try {
            const response = await fetch('/api/download/single', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentDownloadId = data.download_id;
                this.addLogEntry(`📥 Download started (ID: ${data.download_id.substring(0, 8)}...)`, 'success');
            } else {
                this.addLogEntry(`❌ ${data.error}`, 'error');
                this.stopDownload();
            }
        } catch (error) {
            this.addLogEntry(`❌ Network error: ${error.message}`, 'error');
            this.stopDownload();
        }
    }
    
    async handleBatchDownload() {
        if (this.isDownloading) return;
        
        const startUrl = this.startUrlInput.value.trim();
        const endUrl = this.endUrlInput.value.trim();
        const outputName = this.outputNameInput.value.trim() || 'downloaded_document';
        const outputFormat = this.outputFormatSelect.value;
        
        if (!startUrl || !endUrl || !this.isValidUrl(startUrl) || !this.isValidUrl(endUrl)) {
            this.addLogEntry('❌ Please enter valid start and end URLs', 'error');
            return;
        }
        
        this.startDownload();
        this.addLogEntry(`🚀 Starting batch download...`);
        
        try {
            const response = await fetch('/api/download/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    start_url: startUrl,
                    end_url: endUrl,
                    output_name: outputName,
                    output_format: outputFormat
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentDownloadId = data.download_id;
                this.addLogEntry(`📥 Batch download started (ID: ${data.download_id.substring(0, 8)}...)`, 'success');
            } else {
                this.addLogEntry(`❌ ${data.error}`, 'error');
                this.stopDownload();
            }
        } catch (error) {
            this.addLogEntry(`❌ Network error: ${error.message}`, 'error');
            this.stopDownload();
        }
    }
    
    handleProgressUpdate(data) {
        if (data.download_id !== this.currentDownloadId) return;
        
        // Update progress bar
        if (data.total > 0) {
            const percentage = Math.round((data.progress / data.total) * 100);
            this.updateProgress(percentage, data.message);
        } else {
            this.updateProgress(0, data.message);
        }
        
        // Add log entry
        const logType = data.status === 'error' ? 'error' : 
                       data.status === 'completed' ? 'success' : 'info';
        this.addLogEntry(data.message, logType);
        
        // Handle completion
        if (data.status === 'completed') {
            this.stopDownload();
            if (data.filename) {
                this.showDownloadButton(data.filename);
            }
        } else if (data.status === 'error') {
            this.stopDownload();
        }
    }
    
    showDownloadButton(filename) {
        this.downloadedFile = filename;
        this.downloadSection.style.display = 'block';
        this.downloadFileBtn.innerHTML = `<i class="fas fa-download"></i> Download ${filename}`;
    }
    
    handleFileDownload() {
        if (this.downloadedFile) {
            window.location.href = `/downloads/${this.downloadedFile}`;
        }
    }
    
    startDownload() {
        this.isDownloading = true;
        this.updateButtonStates();
        this.clearLog();
        this.updateProgress(0, 'Starting download...');
        this.downloadSection.style.display = 'none';
        this.downloadedFile = null;
    }
    
    stopDownload() {
        this.isDownloading = false;
        this.currentDownloadId = null;
        this.updateButtonStates();
    }
    
    updateButtonStates() {
        // Update single download button
        if (this.isDownloading) {
            this.downloadSingleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            this.downloadSingleBtn.disabled = true;
            this.downloadSingleBtn.classList.add('loading');
        } else {
            this.downloadSingleBtn.innerHTML = '<i class="fas fa-download"></i> Download';
            this.downloadSingleBtn.classList.remove('loading');
            this.validateSingleForm();
        }
        
        // Update batch download button
        if (this.isDownloading) {
            this.downloadBatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
            this.downloadBatchBtn.disabled = true;
            this.downloadBatchBtn.classList.add('loading');
        } else {
            this.downloadBatchBtn.innerHTML = '<i class="fas fa-rocket"></i> Start Batch Download';
            this.downloadBatchBtn.classList.remove('loading');
            this.validateBatchForm();
        }
    }
    
    updateProgress(percentage, message) {
        this.progressFill.style.width = `${percentage}%`;
        this.progressPercentage.textContent = `${percentage}%`;
        this.progressText.textContent = message;
        
        // Add shimmer effect during download
        if (percentage > 0 && percentage < 100) {
            this.progressFill.classList.add('loading');
        } else {
            this.progressFill.classList.remove('loading');
        }
    }
    
    addLogEntry(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        logEntry.innerHTML = `
            <span class="timestamp">[${timestamp}]</span>
            <span class="message">${message}</span>
        `;
        
        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
        
        // Add entrance animation
        logEntry.style.opacity = '0';
        logEntry.style.transform = 'translateY(10px)';
        
        requestAnimationFrame(() => {
            logEntry.style.transition = 'all 0.3s ease';
            logEntry.style.opacity = '1';
            logEntry.style.transform = 'translateY(0)';
        });
    }
    
    clearLog() {
        this.logContainer.innerHTML = '';
    }
}

// CSS Animation Classes
const style = document.createElement('style');
style.textContent = `
    .fade-in {
        animation: fadeIn 0.3s ease-in-out;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    .pulse {
        animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(74, 158, 255, 0.4);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(74, 158, 255, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(74, 158, 255, 0);
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImageDownloaderApp();
});

// Add some nice touches
document.addEventListener('DOMContentLoaded', () => {
    // Add example URLs on focus
    const startUrlInput = document.getElementById('start-url');
    const endUrlInput = document.getElementById('end-url');
    
    startUrlInput.addEventListener('focus', function() {
        if (!this.value) {
            this.placeholder = 'https://streaming.mileseducation.com/cpa_ebooks/FAR-2025/F4/0026.jpg';
        }
    });
    
    endUrlInput.addEventListener('focus', function() {
        if (!this.value) {
            this.placeholder = 'https://streaming.mileseducation.com/cpa_ebooks/FAR-2025/F4/0049.jpg';
        }
    });
    
    // Add smooth scrolling to progress section when download starts
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.target.id === 'log-container') {
                const progressSection = document.querySelector('.progress-section');
                if (progressSection) {
                    progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        });
    });
    
    const logContainer = document.getElementById('log-container');
    if (logContainer) {
        observer.observe(logContainer, { childList: true });
    }
});