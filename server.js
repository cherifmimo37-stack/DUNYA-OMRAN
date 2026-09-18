const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// الملفات الموجودة داخل public
app.use(express.static(path.join(__dirname, "public")));

// اختبار السيرفر
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        app: "دنيا العمران والترقية",
        status: "online"
    });
});

// بيانات أولية للوحة التحكم
app.get("/api/dashboard", (req, res) => {
    res.json({
        success: true,
        stats: {
            projects: 0,
            workers: 0,
            materials: 0,
            todayAppointments: 0,
            todayExpenses: 0,
            stockValue: 0
        }
    });
});

// أي صفحة غير موجودة ترجع الواجهة الرئيسية
app.get("*", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(
        `DUNYA-OMRAN running on port ${PORT}`
    );
});
