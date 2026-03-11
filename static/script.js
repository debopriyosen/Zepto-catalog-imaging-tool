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

// --- RATIO CONVERTER LOGIC (CLIENT-SIDE) ---
const NAMING_CONVENTION = {
    "1": "_Front.jpg", "2": "_Back.jpg", "3": "_Nutri.jpg",
    "4": "_Celebration1.jpg", "5": "_Celebration2.jpg", "6": "_Celebration3.jpg",
    "7": "_Celebration4.jpg", "8": "_Celebration5.jpg", "9": "_Celebration6.jpg", "10": "_Celebration7.jpg"
};

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

    const ratio = ratioSelect.value;
    const [targetW, targetH] = ratio.split(':').map(Number);
    const targetRatio = targetW / targetH;

    processBtn.disabled = true;
    statusContainer.classList.remove('hidden');
    errorLog.classList.add('hidden');
    errorList.innerHTML = '';
    downloadSection.classList.add('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressText.textContent = 'Reading Excel file...';

    try {
        // 1. Read Excel File
        const data = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) throw new Error('Excel file is empty.');

        // 2. Extract Work Items
        const workItems = [];
        const uniquePvids = [];
        const pvidToPart = {};

        json.forEach((row, index) => {
            // Find PVID column (case-insensitive)
            const pvidKey = Object.keys(row).find(k => k.toLowerCase().trim() === 'pvid');
            const pvid = pvidKey ? String(row[pvidKey]).trim() : `unknown_${index}`;

            if (!pvidToPart[pvid]) {
                uniquePvids.push(pvid);
                const partNum = Math.floor((uniquePvids.length - 1) / 100) + 1;
                pvidToPart[pvid] = `part${partNum}`;
            }

            // Find Image Links
            Object.keys(row).forEach(key => {
                const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                let slot = null;
                if (normKey.startsWith('image') && !isNaN(normKey.replace('image', ''))) {
                    slot = normKey.replace('image', '');
                } else if (normKey.startsWith('imagelink') && !isNaN(normKey.replace('imagelink', ''))) {
                    slot = normKey.replace('imagelink', '');
                }

                if (slot && NAMING_CONVENTION[slot]) {
                    const url = String(row[key]).trim();
                    if (url.startsWith('http')) {
                        workItems.push({
                            pvid, slot, url, suffix: NAMING_CONVENTION[slot], part: pvidToPart[pvid]
                        });
                    }
                }
            });
        });

        if (workItems.length === 0) throw new Error('No valid image URLs found. Ensure columns are named PVID, Image1, Image2, etc.');

        const total = workItems.length;
        let completed = 0;
        let failed = 0;
        const results = [];
        const zip = new JSZip();

        // 3. Process Images in Parallel (with concurrency limit)
        const CONCURRENCY = 10;
        const chunks = [];
        for (let i = 0; i < workItems.length; i += CONCURRENCY) {
            chunks.push(workItems.slice(i, i + CONCURRENCY));
        }

        progressText.textContent = `Processing ${total} images...`;

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (item) => {
                try {
                    const blob = await processImageClientSide(item.url, targetRatio);
                    zip.folder(item.part).file(`${item.pvid}${item.suffix}`, blob);
                    results.push({ PVID: item.pvid, Slot: item.slot, URL: item.url, Status: 'Success', Error: '' });
                } catch (err) {
                    failed++;
                    results.push({ PVID: item.pvid, Slot: item.slot, URL: item.url, Status: 'Failed', Error: err.message });
                    addErrorMessage(`${item.pvid} (Slot ${item.slot}): ${err.message}`);
                }
                completed++;
                const percent = Math.round((completed / total) * 95);
                progressFill.style.width = `${percent}%`;
                progressPercent.textContent = `${percent}%`;
            }));
        }

        // 4. Generate CSV Log
        progressText.textContent = 'Generating final bundle...';
        const csvContent = "PVID,ImageSlot,URL,Status,Error\n" +
            results.map(r => `"${r.PVID}","${r.Slot}","${r.URL}","${r.Status}","${r.Error}"`).join("\n");
        zip.file("conversion_log.csv", csvContent);

        // 5. Create ZIP and Download
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);

        downloadBtn.href = zipUrl;
        downloadBtn.download = `catalog_output_${new Date().getTime()}.zip`;
        downloadSection.classList.remove('hidden');

        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressText.textContent = `Completed! ${total - failed} success, ${failed} failed.`;

    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
        progressText.textContent = 'Failed';
        processBtn.disabled = false;
    }
});

async function processImageClientSide(url, targetRatio) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let w = img.width;
            let h = img.height;
            const currentRatio = w / h;

            let targetW, targetH;
            if (currentRatio > targetRatio) {
                targetW = w;
                targetH = w / targetRatio;
            } else {
                targetH = h;
                targetW = h * targetRatio;
            }

            canvas.width = targetW;
            canvas.height = targetH;

            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, targetW, targetH);

            const x = (targetW - w) / 2;
            const y = (targetH - h) / 2;
            ctx.drawImage(img, x, y, w, h);

            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.95);
        };
        img.onerror = () => reject(new Error('Failed to load image. This might be due to CORS restrictions on the image server or the URL being invalid.'));

        // Use the backend proxy to bypass CORS
        img.src = `/proxy?url=${encodeURIComponent(url)}`;
    });
}

function addErrorMessage(msg) {
    errorLog.classList.remove('hidden');
    const li = document.createElement('li');
    li.textContent = msg;
    errorList.appendChild(li);
    errorCount.textContent = errorList.children.length;
}

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
    pvidProgressText.textContent = 'Grouping files by PVID...';

    try {
        const zip = new JSZip();
        const pvidMap = {};

        // 1. Map all files to their PVIDs
        const processFiles = (files, slotSuffix) => {
            files.forEach(file => {
                const name = file.name;
                const pvidMatch = name.match(/^([a-f0-9-]+)/i);
                const pvid = pvidMatch ? pvidMatch[1] : 'unknown';

                if (!pvidMap[pvid]) pvidMap[pvid] = [];
                pvidMap[pvid].push({ file, slotSuffix });
            });
        };

        processFiles(files1x1, '_1x1');
        processFiles(files3x4, '_3x4');

        const uniquePvids = Object.keys(pvidMap);
        const totalPvids = uniquePvids.length;

        if (totalPvids === 0) throw new Error('No files found to organize.');

        // 2. Add files to ZIP in parts (max 100 PVIDs per part)
        for (let i = 0; i < totalPvids; i++) {
            const pvid = uniquePvids[i];
            const partNum = Math.floor(i / 100) + 1;
            const partFolder = zip.folder(`part${partNum}`);

            pvidMap[pvid].forEach(item => {
                partFolder.file(item.file.name, item.file);
            });

            // Update Progress
            const progress = Math.round(((i + 1) / totalPvids) * 90);
            pvidProgressFill.style.width = `${progress}%`;
            pvidProgressPercent.textContent = `${progress}%`;
            pvidProgressText.textContent = `Organizing PVID ${i + 1} of ${totalPvids}...`;

            // Allow UI to breathe
            if (i % 50 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // 3. Generate ZIP
        pvidProgressText.textContent = 'Generating final bundle...';
        const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
            const progress = 90 + Math.round(metadata.percent / 10);
            pvidProgressFill.style.width = `${progress}%`;
            pvidProgressPercent.textContent = `${progress}%`;
        });

        const zipUrl = URL.createObjectURL(zipBlob);
        pvidDownloadBtn.href = zipUrl;
        pvidDownloadBtn.download = `organized_pvids_${new Date().getTime()}.zip`;
        pvidDownloadSection.classList.remove('hidden');

        pvidProgressFill.style.width = '100%';
        pvidProgressPercent.textContent = '100%';
        pvidProgressText.textContent = 'Completed successfully!';

    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
        pvidProgressText.textContent = 'Failed';
        runGroupingBtn.disabled = false;
    }
});

// Helper for UI error messages in Ratio tool (re-defining since showErrors is gone)
function showRatioErrors(errors) {
    errorLog.classList.remove('hidden');
    errorCount.textContent = errors.length;
    errorList.innerHTML = '';
    errors.forEach(err => {
        const li = document.createElement('li');
        li.textContent = err;
        errorList.appendChild(li);
    });
}
