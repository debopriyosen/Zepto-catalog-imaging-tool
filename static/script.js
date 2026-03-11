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
    const userDisplay = document.getElementById('user-display');
    const header = document.querySelector('.header');

    if (viewName === 'login') {
        logoutBtn.classList.add('hidden');
        userDisplay.classList.add('hidden');
        header.classList.add('hidden');
        initGoogleSignIn();
    } else {
        logoutBtn.classList.remove('hidden');
        userDisplay.classList.remove('hidden');
        header.classList.remove('hidden');
        updateUserDisplay();
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
    document.getElementById('user-display').textContent = '';
    switchView('login');
}

function updateUserDisplay() {
    const userDisplay = document.getElementById('user-display');
    if (userEmail) {
        // Extract name from email (e.g., john.doe@example.com -> John Doe or john.doe)
        const namePart = userEmail.split('@')[0];
        // Replace dots/underscores with spaces and capitalize
        const displayName = namePart.replace(/[._]/g, ' ');
        userDisplay.textContent = displayName;
    } else {
        userDisplay.textContent = '';
    }
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
    pvidProgressText.textContent = 'Initializing PVID logic...';

    try {
        const zip = new JSZip();
        const rootFolder = zip.folder("Group by PVID");
        const logRows = [];
        const reportRows = [];

        const uuidRe = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})_(.+)$/;

        const parseName = (name) => {
            const stem = name.substring(0, name.lastIndexOf('.')) || name;
            const ext = name.substring(name.lastIndexOf('.'));
            const match = stem.match(uuidRe);
            return match ? { uuid: match[1].trim(), label: match[2].trim(), ext } : null;
        };

        const logAppend = (phase, bucket, uuid, label, action, reason, src, dest) => {
            logRows.push({ phase, bucket, uuid, label, action, reason, src_path: src, dest_path: dest });
        };

        // 1. Initial Grouping
        pvidProgressText.textContent = 'Phase 1/4: Initial Grouping...';
        const groupPvid = (files, bucket) => {
            const map = {};
            files.forEach(f => {
                const parsed = parseName(f.name);
                if (parsed) {
                    if (!map[parsed.uuid]) map[parsed.uuid] = {};
                    map[parsed.uuid][parsed.label] = { file: f, ext: parsed.ext };
                    const dest = `Group by PVID/${bucket}/${parsed.uuid}/${parsed.label}${parsed.ext}`;
                    rootFolder.folder(bucket).folder(parsed.uuid).file(`${parsed.label}${parsed.ext}`, f);
                    logAppend("GROUP", bucket, parsed.uuid, parsed.label, "COPY", "", f.name, dest);
                } else {
                    logAppend("GROUP", bucket, "N/A", "N/A", "SKIPPED", "name_mismatch", f.name, "");
                }
            });
            return map;
        };

        const map1x1 = groupPvid(files1x1, "1x1");
        const map3x4 = groupPvid(files3x4, "3x4");

        // 2. Match and Triage
        pvidProgressText.textContent = 'Phase 2/4: Triage Match vs Non-Match...';
        const allUuids = Array.from(new Set([...Object.keys(map1x1), ...Object.keys(map3x4)])).sort();
        const nonMatchedFolder = rootFolder.folder("non_matched");

        allUuids.forEach(u => {
            const labels1 = map1x1[u] ? Object.keys(map1x1[u]) : [];
            const labels3 = map3x4[u] ? Object.keys(map3x4[u]) : [];

            const set1 = new Set(labels1);
            const set3 = new Set(labels3);
            const isMatch = labels1.length > 0 && labels3.length > 0 && labels1.length === labels3.length && labels1.every(l => set3.has(l));

            if (isMatch) {
                reportRows.push({ uuid: u, status: "MATCHED", labels_1x1: labels1.sort().join(','), labels_3x4: labels3.sort().join(','), reason: "" });
            } else {
                let status = "NON_MATCHED";
                let reason = "";
                if (labels1.length > 0 && labels3.length > 0) {
                    status = "NON_MATCHED_DIFFERENT_LABELS";
                    reason = "label_sets_differ";
                } else if (labels1.length > 0) {
                    status = "NON_MATCHED_ONLY_1x1";
                    reason = "missing_in_3x4";
                } else {
                    status = "NON_MATCHED_ONLY_3x4";
                    reason = "missing_in_1x1";
                }
                reportRows.push({ uuid: u, status, labels_1x1: labels1.sort().join(','), labels_3x4: labels3.sort().join(','), reason });

                // Copy to non_matched
                if (map1x1[u]) {
                    Object.entries(map1x1[u]).forEach(([lab, info]) => {
                        nonMatchedFolder.folder("1x1").folder(u).file(`${lab}${info.ext}`, info.file);
                        logAppend("NON_MATCHED", "1x1", u, lab, "COPY", "", info.file.name, `non_matched/1x1/${u}/${lab}${info.ext}`);
                    });
                }
                if (map3x4[u]) {
                    Object.entries(map3x4[u]).forEach(([lab, info]) => {
                        nonMatchedFolder.folder("3x4").folder(u).file(`${lab}${info.ext}`, info.file);
                        logAppend("NON_MATCHED", "3x4", u, lab, "COPY", "", info.file.name, `non_matched/3x4/${u}/${lab}${info.ext}`);
                    });
                }
            }
        });

        // 3. Prune and Promote (Matched by Python)
        pvidProgressText.textContent = 'Phase 3/4: Pruning and Promotion...';
        const mpFolder = rootFolder.folder("Matched by Python");
        const mapMP1 = {};
        const mapMP3 = {};

        allUuids.forEach(u => {
            if (map1x1[u] && map3x4[u]) {
                const labels1 = Object.keys(map1x1[u]);
                const labels3 = Object.keys(map3x4[u]);
                const commonLabels = labels1.filter(l => map3x4[u][l]);

                if (commonLabels.length > 0 && (labels1.length !== labels3.length || labels1.some(l => !map3x4[u][l]))) {
                    // It was non-matched but has common labels
                    commonLabels.forEach(lab => {
                        const info1 = map1x1[u][lab];
                        const info3 = map3x4[u][lab];

                        mpFolder.folder("1x1").folder(u).file(`${lab}${info1.ext}`, info1.file);
                        mpFolder.folder("3x4").folder(u).file(`${lab}${info3.ext}`, info3.file);

                        if (!mapMP1[u]) mapMP1[u] = {};
                        if (!mapMP3[u]) mapMP3[u] = {};
                        mapMP1[u][lab] = info1;
                        mapMP3[u][lab] = info3;

                        logAppend("PROMOTE", "1x1", u, lab, "COPY", "pruned_match", info1.file.name, `Matched by Python/1x1/${u}/${lab}${info1.ext}`);
                        logAppend("PROMOTE", "3x4", u, lab, "COPY", "pruned_match", info3.file.name, `Matched by Python/3x4/${u}/${lab}${info3.ext}`);
                    });
                }
            }
        });

        // 4. Build GTG
        pvidProgressText.textContent = 'Phase 4/4: Building GTG Sets...';
        const gtg1Folder = rootFolder.folder("1x1_GTG");
        const gtg3Folder = rootFolder.folder("3x4_GTG");

        allUuids.forEach(u => {
            let src1 = null;
            let src3 = null;

            // Prefer Matched by Python
            if (mapMP1[u] && mapMP3[u]) {
                src1 = mapMP1[u];
                src3 = mapMP3[u];
            } else if (map1x1[u] && map3x4[u]) {
                // Check if naturally matched
                const labels1 = Object.keys(map1x1[u]);
                const labels3 = Object.keys(map3x4[u]);
                if (labels1.length > 0 && labels1.length === labels3.length && labels1.every(l => map3x4[u][l])) {
                    src1 = map1x1[u];
                    src3 = map3x4[u];
                }
            }

            if (src1 && src3) {
                Object.entries(src1).forEach(([lab, info]) => {
                    gtg1Folder.folder(u).file(`${lab}${info.ext}`, info.file);
                    logAppend("GTG", "1x1", u, lab, "COPY", "", info.file.name, `1x1_GTG/${u}/${lab}${info.ext}`);
                });
                Object.entries(src3).forEach(([lab, info]) => {
                    gtg3Folder.folder(u).file(`${lab}${info.ext}`, info.file);
                    logAppend("GTG", "3x4", u, lab, "COPY", "", info.file.name, `3x4_GTG/${u}/${lab}${info.ext}`);
                });
            }
        });

        // 5. CSV Reports
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const csvHeader = "phase,bucket,uuid,label,action,reason,src_path,dest_path\n";
        const csvBody = logRows.map(r => `"${r.phase}","${r.bucket}","${r.uuid}","${r.label}","${r.action}","${r.reason}","${r.src_path}","${r.dest_path}"`).join('\n');
        rootFolder.file(`group_log_${ts}.csv`, csvHeader + csvBody);

        const repHeader = "uuid,status,labels_1x1,labels_3x4,reason\n";
        const repBody = reportRows.map(r => `"${r.uuid}","${r.status}","${r.labels_1x1}","${r.labels_3x4}","${r.reason}"`).join('\n');
        rootFolder.file(`match_report_${ts}.csv`, repHeader + repBody);

        // 6. Generate ZIP
        pvidProgressText.textContent = 'Generating final bundle...';
        const zipBlob = await zip.generateAsync({ type: "blob" }, (metadata) => {
            const progress = 95 + Math.round(metadata.percent / 20); // Mostly done
            pvidProgressFill.style.width = `${Math.min(100, progress)}%`;
            pvidProgressPercent.textContent = `${Math.min(100, progress)}%`;
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
