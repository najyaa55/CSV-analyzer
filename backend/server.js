const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

let dataset = [];
let columns = [];

// ------------------- Upload CSV -------------------
app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    dataset = [];
    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on("data", row => dataset.push(row))
        .on("end", () => {
            columns = Object.keys(dataset[0]).map(col => {
                const firstNonEmpty = dataset.find(r => r[col] !== "")?.[col];
                const isNumeric = !isNaN(firstNonEmpty);
                return { name: col, type: isNumeric ? "numeric" : "string" };
            });
            console.log("CSV loaded:", dataset.length, "rows");
            res.json({ dataset_id: 1, columns });
        });
});

// ------------------- Return Table -------------------
app.get("/api/dataset/1/table", (req, res) => {
    res.json(dataset);
});

// ------------------- Column Stats -------------------
app.get("/api/dataset/1/column/:col/stats", (req, res) => {
    const col = decodeURIComponent(req.params.col);
    const valuesRaw = dataset.map(r => r[col]);
    const numericValues = valuesRaw.map(v => parseFloat(v)).filter(v => !isNaN(v));
    const missingCount = valuesRaw.length - numericValues.length;
    const isNumeric = numericValues.length > 0;

    let stats = { missing_count: missingCount };

    if (isNumeric) {
        const sorted = [...numericValues].sort((a,b)=>a-b);
        stats.min = Math.min(...numericValues);
        stats.max = Math.max(...numericValues);
        stats.mean = numericValues.reduce((a,b)=>a+b,0)/numericValues.length;
        stats.median = sorted.length % 2 === 0 ?
            (sorted[sorted.length/2 -1] + sorted[sorted.length/2])/2 :
            sorted[Math.floor(sorted.length/2)];

        const freq = {};
        numericValues.forEach(v => freq[v] = (freq[v]||0)+1);
        const maxFreq = Math.max(...Object.values(freq));
        stats.mode = Object.keys(freq).filter(k=>freq[k]==maxFreq).map(Number);
    } else {
        stats.min = stats.max = stats.mean = stats.median = stats.mode = "Not applicable";
    }
    

    res.json(stats);
});

// ------------------- Column Histogram -------------------
app.get("/api/dataset/1/column/:col/hist", (req, res) => {
    const col = decodeURIComponent(req.params.col);
    const values = dataset.map(r => parseFloat(r[col])).filter(v => !isNaN(v));

    if (!values.length) return res.json({ bins: [], counts: [], message: "No numeric data" });

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binCount = 30;
    const binWidth = (max - min)/binCount;
    const bins = Array.from({length:binCount}, (_,i)=>min + i*binWidth);
    const counts = Array(binCount).fill(0);

    values.forEach(v=>{
        let idx = Math.floor((v - min)/binWidth);
        if(idx===binCount) idx--; // include max in last bin
        counts[idx]++;
    });

    res.json({ bins, counts });
});

// ------------------- Start Server -------------------
app.listen(5000, () => console.log("Server running on port 5000"));