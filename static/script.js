// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    home: document.getElementById('home-view'),
    ratio: document.getElementById('ratio-view'),
    pvid: document.getElementById('pvid-view')
};

const mainTitle = document.getElementById('main-title');
const mainSubtitle = document.getElementById('main-subtitle');

// Navigation
document.getElementById('btn-goto-ratio').addEventListener('click', () => switchView('ratio'));
document.getElementById('btn-goto-pvid').addEventListener('click', () => switchView('pvid'));
document.getElementById('back-to-home-ratio').addEventListener('click', () => switchView('home'));
document.getElementById('back-to-home-pvid').addEventListener('click', () => switchView('home'));
document.getElementById('logout-btn').addEventListener('click', () => handleLogout());

async function switchView(viewName) {
    if (viewName !== 'login') {
        const authenticated = await checkAuth();
        if (!authenticated) {
            viewName = 'login';
        }
    }

    Object.keys(views).forEach(v => views[v].classList.add('hidden'));
    views[viewName].classList.remove('hidden');

    const logoutBtn = document.getElementById('logout-btn');
    const header = document.querySelector('.header');

    if (viewName === 'login') {
        logoutBtn.classList.add('hidden');
        header.classList.add('hidden');
        initGoogleSignIn();
    } else {
        logoutBtn.classList.remove('hidden');
        header.classList.remove('hidden');
    }

    if (viewName === 'home') {
        mainTitle.innerHTML = 'Zepto Catalog <span class="accent">Image Automation Tool</span>';
        mainSubtitle.textContent = 'Select a tool to begin optimizing your catalog visuals.';
    } else if (viewName === 'ratio') {
        mainTitle.innerHTML = 'Image <span class="accent">Ratio Converter</span>';
        mainSubtitle.textContent = 'Bulk process images from Excel with precision padding.';
    } else if (viewName === 'pvid') {
        mainTitle.innerHTML = 'PVID <span class="accent">Folder Organizer</span>';
        mainSubtitle.textContent = 'Group and structure images by PVID from dual folders.';
    }
}

// --- AUTH LOGIC ---
let userEmail = null;

async function checkAuth() {
    try {
        const response = await fetch('/auth/user');
        if (response.ok) {
            const data = await response.json();
            userEmail = data.email;
            return true;
        }
    } catch (error) {
        console.error("Auth check failed:", error);
    }
    return false;
}

async function initGoogleSignIn() {
    try {
        const response = await fetch('/auth/config');
        const config = await response.json();

        if (!config.google_client_id) {
            console.warn("GOOGLE_CLIENT_ID not found in backend config");
            return;
        }

        google.accounts.id.initialize({
            client_id: config.google_client_id,
            callback: handleGoogleCredentialResponse,
            auto_select: true
        });

        google.accounts.id.renderButton(
            document.getElementById("google-signin-button"),
            { theme: "outline", size: "large", width: 280, shape: "pill" }
        );
    } catch (error) {
        console.error("Failed to initialize Google Sign-In:", error);
    }
}

async function handleGoogleCredentialResponse(response) {
    const loginError = document.getElementById('login-error');
    const generalError = document.getElementById('general-error');

    loginError.classList.add('hidden');
    generalError.classList.add('hidden');

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });

        if (res.ok) {
            const data = await res.json();
            userEmail = data.email;
            switchView('home');
        } else {
            if (res.status === 403) {
                loginError.classList.remove('hidden');
            } else {
                generalError.classList.remove('hidden');
            }
        }
    } catch (error) {
        generalError.classList.remove('hidden');
    }
}

async function handleLogout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
    } catch (e) { }
    userEmail = null;
    switchView('login');
}

// Initial session check
window.addEventListener('DOMContentLoaded', async () => {
    const authenticated = await checkAuth();
    if (authenticated) {
        switchView('home');
    } else {
        switchView('login');
    }
});

// Custom Dropdown Logic
const dropdown = document.getElementById('ratio-dropdown');
const dropdownTrigger = document.getElementById('dropdown-trigger');
const dropdownMenu = document.getElementById('dropdown-menu');
const selectedLabel = document.getElementById('selected-label');
const ratioSelect = document.getElementById('ratio-select');
const dropdownItems = document.querySelectorAll('.dropdown-item');

dropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
});

dropdownItems.forEach(item => {
    item.addEventListener('click', () => {
        const value = item.getAttribute('data-value');
        const label = item.textContent;

        ratioSelect.value = value;
        selectedLabel.textContent = label;

        dropdownItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        dropdown.classList.remove('open');
    });
});

document.addEventListener('click', () => {
    dropdown.classList.remove('open');
});

// --- RATIO CONVERTER LOGIC ---
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const processBtn = document.getElementById('process-btn');
const statusContainer = document.getElementById('status-container');
const progressFill = document.getElementById('progress-fill');
const progressPercent = document.getElementById('progress-percent');
const progressText = document.getElementById('progress-text');
const errorLog = document.getElementById('error-log');
const errorList = document.getElementById('error-list');
const errorCount = document.getElementById('error-count');
const downloadSection = document.getElementById('download-section');
const downloadBtn = document.getElementById('download-btn');
const clearRatioBtn = document.getElementById('clear-ratio');

let selectedFile = null;
let pollInterval = null;

dropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

['dragover', 'dragleave', 'drop'].forEach(evt => {
    dropArea.addEventListener(evt, (e) => {
        e.preventDefault();
        if (evt === 'dragover') {
            dropArea.classList.add('active');
            e.dataTransfer.dropEffect = 'copy';
        }
        else dropArea.classList.remove('active');
        if (evt === 'drop') handleFiles(e.dataTransfer.files);
    });
});

function handleFiles(files) {
    if (files.length > 0) {
        selectedFile = files[0];
        fileName.textContent = selectedFile.name;
        processBtn.disabled = false;
        clearRatioBtn.classList.remove('hidden');
    }
}

clearRatioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileName.textContent = 'No file selected';
    fileInput.value = '';
    processBtn.disabled = true;
    clearRatioBtn.classList.add('hidden');
});

processBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);
    const ratio = ratioSelect.value;

    processBtn.disabled = true;
    statusContainer.classList.remove('hidden');
    errorLog.classList.add('hidden');
    downloadSection.classList.add('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressText.textContent = 'Uploading and extracting metadata...';

    try {
        // 1. Upload Metadata and get items
        const metadataRes = await fetch(`/upload-metadata?ratio=${encodeURIComponent(ratio)}`, {
            method: 'POST',
            body: formData
        });

        if (!metadataRes.ok) throw new Error('Failed to upload and parse metadata');
        const { task_id, work_items, total_items } = await metadataRes.json();

        if (total_items === 0) {
            throw new Error('No valid images found in the uploaded file. Check column names (PVID, Image1, etc.) and URLs.');
        }

        const BATCH_SIZE = 50;
        let processedItems = 0;
        const conversionResults = [];

        // 2. Process in Batches
        for (let i = 0; i < work_items.length; i += BATCH_SIZE) {
            const batch = work_items.slice(i, i + BATCH_SIZE);
            progressText.textContent = `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(total_items / BATCH_SIZE)}...`;

            const batchRes = await fetch(`/process-batch?task_id=${task_id}&ratio=${encodeURIComponent(ratio)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch)
            });

            if (!batchRes.ok) throw new Error(`Batch processing failed at item ${i}`);
            const data = await batchRes.json();

            conversionResults.push(...data.results);
            processedItems += batch.length;

            // Update UI progress
            const progress = Math.round((processedItems / total_items) * 98); // save 2% for finalization
            progressFill.style.width = `${progress}%`;
            progressPercent.textContent = `${progress}%`;
        }

        // 3. Finalize Task
        progressText.textContent = 'Finalizing ZIP and logs...';
        const finalizeRes = await fetch(`/finalize-task?task_id=${task_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(conversionResults)
        });

        if (!finalizeRes.ok) throw new Error('Failed to finalize task');
        const finalData = await finalizeRes.json();

        // Complete!
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressText.textContent = 'Processing completed successfully!';

        downloadBtn.href = finalData.zip_url;
        downloadSection.classList.remove('hidden');

    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
        progressText.textContent = 'Failed';
        processBtn.disabled = false;
    }
});

// --- PVID ORGANIZER LOGIC ---
const dropArea1x1 = document.getElementById('drop-area-1x1');
const dropArea3x4 = document.getElementById('drop-area-3x4');
const input1x1 = document.getElementById('folder-1x1');
const input3x4 = document.getElementById('folder-3x4');
const name1x1 = document.getElementById('name-1x1');
const name3x4 = document.getElementById('name-3x4');
const runGroupingBtn = document.getElementById('run-grouping-btn');
const pvidStatusContainer = document.getElementById('pvid-status-container');
const pvidProgressFill = document.getElementById('pvid-progress-fill');
const pvidProgressPercent = document.getElementById('pvid-progress-percent');
const pvidProgressText = document.getElementById('pvid-progress-text');
const pvidErrorLog = document.getElementById('pvid-error-log');
const pvidErrorList = document.getElementById('pvid-error-list');
const pvidErrorCount = document.getElementById('pvid-error-count');
const pvidDownloadSection = document.getElementById('pvid-download-section');
const pvidDownloadBtn = document.getElementById('pvid-download-btn');
const clear1x1Btn = document.getElementById('clear-1x1');
const clear3x4Btn = document.getElementById('clear-3x4');

let files1x1 = [];
let files3x4 = [];

dropArea1x1.addEventListener('click', () => input1x1.click());
dropArea3x4.addEventListener('click', () => input3x4.click());

input1x1.addEventListener('change', (e) => {
    files1x1 = Array.from(e.target.files);
    if (files1x1.length > 0) {
        name1x1.textContent = `${files1x1.length} files selected`;
        clear1x1Btn.classList.remove('hidden');
    }
    checkPvidReady();
});

input3x4.addEventListener('change', (e) => {
    files3x4 = Array.from(e.target.files);
    if (files3x4.length > 0) {
        name3x4.textContent = `${files3x4.length} files selected`;
        clear3x4Btn.classList.remove('hidden');
    }
    checkPvidReady();
});

clear1x1Btn.addEventListener('click', (e) => {
    e.stopPropagation();
    files1x1 = [];
    name1x1.textContent = 'No folder selected';
    input1x1.value = '';
    clear1x1Btn.classList.add('hidden');
    checkPvidReady();
});

clear3x4Btn.addEventListener('click', (e) => {
    e.stopPropagation();
    files3x4 = [];
    name3x4.textContent = 'No folder selected';
    input3x4.value = '';
    clear3x4Btn.classList.add('hidden');
    checkPvidReady();
});

function checkPvidReady() {
    runGroupingBtn.disabled = files1x1.length === 0 && files3x4.length === 0;
}

// Drag & Drop for PVID
[dropArea1x1, dropArea3x4].forEach(area => {
    ['dragover', 'dragleave', 'drop'].forEach(evt => {
        area.addEventListener(evt, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (evt === 'dragover') {
                area.classList.add('active');
                e.dataTransfer.dropEffect = 'copy';
            }
            else area.classList.remove('active');

            if (evt === 'drop') {
                const items = e.dataTransfer.items;
                const droppedFiles = await handleFolderDrop(items);

                if (area === dropArea1x1) {
                    files1x1 = droppedFiles;
                    name1x1.textContent = `${files1x1.length} files selected`;
                    if (files1x1.length > 0) clear1x1Btn.classList.remove('hidden');
                } else {
                    files3x4 = droppedFiles;
                    name3x4.textContent = `${files3x4.length} files selected`;
                    if (files3x4.length > 0) clear3x4Btn.classList.remove('hidden');
                }
                checkPvidReady();
            }
        });
    });
});

async function handleFolderDrop(items) {
    const promises = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
            promises.push(traverseFileTree(item));
        }
    }
    const results = await Promise.all(promises);
    return results.flat();
}

function traverseFileTree(item) {
    return new Promise((resolve) => {
        if (item.isFile) {
            item.file((file) => resolve([file]));
        } else if (item.isDirectory) {
            const dirReader = item.createReader();
            const entriesList = [];

            function readAllEntries() {
                dirReader.readEntries(async (entries) => {
                    if (entries.length > 0) {
                        for (const entry of entries) {
                            entriesList.push(await traverseFileTree(entry));
                        }
                        readAllEntries(); // Read next block
                    } else {
                        resolve(entriesList.flat());
                    }
                });
            }
            readAllEntries();
        } else {
            resolve([]);
        }
    });
}

runGroupingBtn.addEventListener('click', async () => {
    runGroupingBtn.disabled = true;
    pvidStatusContainer.classList.remove('hidden');
    pvidErrorLog.classList.add('hidden');
    pvidDownloadSection.classList.add('hidden');
    pvidProgressFill.style.width = '0%';
    pvidProgressPercent.textContent = '0%';
    pvidProgressText.textContent = 'Initializing task...';

    try {
        // 1. Initialize Task
        const initRes = await fetch('/pvid/init', { method: 'POST' });
        if (!initRes.ok) throw new Error('Failed to initialize PVID task');
        const { task_id } = await initRes.json();

        const totalFiles = files1x1.length + files3x4.length;
        let uploadedCount = 0;

        // 2. Upload Files Sequentially
        const uploadFolder = async (files, folderName) => {
            for (const file of files) {
                const formData = new FormData();
                formData.append('file', file);

                const uploadRes = await fetch(`/pvid/upload-file?task_id=${task_id}&folder=${folderName}`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadRes.ok) throw new Error(`Failed to upload ${file.name}`);

                uploadedCount++;
                const uploadProgress = Math.round((uploadedCount / totalFiles) * 100);
                pvidProgressFill.style.width = `${uploadProgress}%`;
                pvidProgressPercent.textContent = `${uploadProgress}%`;
                pvidProgressText.textContent = `Uploading files (${uploadedCount}/${totalFiles})...`;
            }
        };

        if (files1x1.length > 0) await uploadFolder(files1x1, '1x1');
        if (files3x4.length > 0) await uploadFolder(files3x4, '3x4');

        // 3. Trigger Process
        pvidProgressText.textContent = 'Starting processing...';
        const startRes = await fetch(`/pvid/process?task_id=${task_id}`, { method: 'POST' });
        if (!startRes.ok) throw new Error('Failed to start PVID processing');

        // 4. Start Polling
        startPolling(task_id, 'pvid');

    } catch (error) {
        alert('Error: ' + error.message);
        runGroupingBtn.disabled = false;
        pvidProgressText.textContent = 'Failed';
    }
});

// --- COMMON POLLING ---
function startPolling(taskId, type) {
    const textEl = type === 'ratio' ? progressText : pvidProgressText;
    const fillEl = type === 'ratio' ? progressFill : pvidProgressFill;
    const percentEl = type === 'ratio' ? progressPercent : pvidProgressPercent;
    const downloadSec = type === 'ratio' ? downloadSection : pvidDownloadSection;
    const downloadA = type === 'ratio' ? downloadBtn : pvidDownloadBtn;
    const btn = type === 'ratio' ? processBtn : runGroupingBtn;

    textEl.textContent = 'Processing...';

    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/status/${taskId}`);
            const data = await response.json();

            const percent = data.progress || 0;
            fillEl.style.width = `${percent}%`;
            percentEl.textContent = `${percent}%`;

            if (data.status === 'completed' || data.status === 'failed') {
                clearInterval(interval);
                btn.disabled = false;

                if (data.status === 'completed') {
                    textEl.textContent = 'Completed!';
                    if (data.zip_url) {
                        downloadSec.classList.remove('hidden');
                        downloadA.href = data.zip_url;
                    }
                } else {
                    textEl.textContent = 'Failed';
                }

                showErrors(data.errors, type);
            }
        } catch (error) {
            console.error('Polling error:', error);
            clearInterval(interval);
        }
    }, 2000);
}

function showErrors(errors, type) {
    const logEl = type === 'ratio' ? errorLog : pvidErrorLog;
    const listEl = type === 'ratio' ? errorList : pvidErrorList;
    const countEl = type === 'ratio' ? errorCount : pvidErrorCount;

    if (errors && errors.length > 0) {
        logEl.classList.remove('hidden');
        countEl.textContent = errors.length;
        listEl.innerHTML = '';
        errors.forEach(err => {
            const li = document.createElement('li');
            li.textContent = err;
            listEl.appendChild(li);
        });
    }
}
