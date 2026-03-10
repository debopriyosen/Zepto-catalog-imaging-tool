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
document.getElementById('logout-btn').addEventListener('click', handleLogout);

// Auth Configuration
const ALLOWED_USERS = [
    'debopriyo.sen@zeptonow.com',
    'debopriyosensupu@gmail.com',
    'rohit.ghosh@zeptonow.com',
    'kishore.g@zeptonow.com',
    'arun.m1@zeptonow.com',
    'prasad.rao@zeptonow.com',
    'k.harish@zeptonow.com'
];
const VALID_PASSWORD = 'catalog2026';

function isAuthenticated() {
    return localStorage.getItem('zepto-session') === 'active';
}

function switchView(viewName) {
    if (viewName !== 'login' && !isAuthenticated()) {
        switchView('login');
        return;
    }

    Object.keys(views).forEach(v => views[v].classList.add('hidden'));
    views[viewName].classList.remove('hidden');

    const logoutBtn = document.getElementById('logout-btn');
    const header = document.querySelector('.header');

    if (viewName === 'login') {
        logoutBtn.classList.add('hidden');
        header.classList.add('hidden');
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
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginEmail.value.trim().toLowerCase();
    const password = loginPassword.value;

    if (ALLOWED_USERS.includes(email) && password === VALID_PASSWORD) {
        localStorage.setItem('zepto-session', 'active');
        loginError.classList.add('hidden');
        switchView('home');
    } else {
        loginError.classList.remove('hidden');
    }
});

function handleLogout() {
    localStorage.removeItem('zepto-session');
    switchView('login');
}

// Initial session check
window.addEventListener('DOMContentLoaded', () => {
    if (isAuthenticated()) {
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
    progressText.textContent = 'Uploading...';

    try {
        const response = await fetch(`/upload?ratio=${encodeURIComponent(ratio)}`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        const data = await response.json();
        startPolling(data.task_id, 'ratio');
    } catch (error) {
        alert('Error: ' + error.message);
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
    const formData = new FormData();
    files1x1.forEach(f => formData.append('folder1x1', f));
    files3x4.forEach(f => formData.append('folder3x4', f));

    runGroupingBtn.disabled = true;
    pvidStatusContainer.classList.remove('hidden');
    pvidErrorLog.classList.add('hidden');
    pvidDownloadSection.classList.add('hidden');
    pvidProgressFill.style.width = '0%';
    pvidProgressPercent.textContent = '0%';
    pvidProgressText.textContent = 'Uploading folders...';

    try {
        const response = await fetch('/upload-pvid', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error('PVID Upload failed');
        const data = await response.json();
        startPolling(data.task_id, 'pvid');
    } catch (error) {
        alert('Error: ' + error.message);
        runGroupingBtn.disabled = false;
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
