const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   POSTGRESQL
========================================================= */

const pool = new Pool({
    connectionString: process.env.DUNYA_DATABASE_URL,
    ssl: process.env.DUNYA_DATABASE_URL
        ? { rejectUnauthorized: false }
        : false
});


/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initDatabase() {

    if (!process.env.DUNYA_DATABASE_URL) {

        console.log(
            "⚠️ DUNYA_DATABASE_URL غير موجودة"
        );

        return;
    }

    try {

        await pool.query(`

            CREATE TABLE IF NOT EXISTS projects (

                id SERIAL PRIMARY KEY,

                name VARCHAR(200) NOT NULL,

                location VARCHAR(300),

                client_name VARCHAR(200),

                engineer_name VARCHAR(200),

                start_date DATE,

                end_date DATE,

                budget NUMERIC(14,2) DEFAULT 0,

                progress NUMERIC(5,2) DEFAULT 0,

                status VARCHAR(50) DEFAULT 'جاري',

                notes TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS workers (

                id SERIAL PRIMARY KEY,

                name VARCHAR(200) NOT NULL,

                phone VARCHAR(50),

                job VARCHAR(150),

                salary NUMERIC(12,2) DEFAULT 0,

                active BOOLEAN DEFAULT TRUE,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS project_workers (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                worker_id INTEGER NOT NULL
                    REFERENCES workers(id)
                    ON DELETE CASCADE,

                role VARCHAR(150),

                joined_at DATE DEFAULT CURRENT_DATE,

                UNIQUE(project_id, worker_id)

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS materials (

                id SERIAL PRIMARY KEY,

                name VARCHAR(200) NOT NULL,

                unit VARCHAR(50),

                description TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS project_materials (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                material_id INTEGER NOT NULL
                    REFERENCES materials(id)
                    ON DELETE CASCADE,

                quantity NUMERIC(14,3) DEFAULT 0,

                used_quantity NUMERIC(14,3) DEFAULT 0,

                unit_price NUMERIC(14,2) DEFAULT 0,

                supplier VARCHAR(200),

                UNIQUE(project_id, material_id)

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS stock_movements (

                id SERIAL PRIMARY KEY,

                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE SET NULL,

                material_id INTEGER NOT NULL
                    REFERENCES materials(id)
                    ON DELETE CASCADE,

                movement_type VARCHAR(20) NOT NULL,

                quantity NUMERIC(14,3) NOT NULL,

                unit_price NUMERIC(14,2) DEFAULT 0,

                supplier VARCHAR(200),

                notes TEXT,

                movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS attendance (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                worker_id INTEGER NOT NULL
                    REFERENCES workers(id)
                    ON DELETE CASCADE,

                attendance_date DATE DEFAULT CURRENT_DATE,

                status VARCHAR(30) DEFAULT 'حاضر',

                hours NUMERIC(5,2) DEFAULT 0,

                notes TEXT,

                UNIQUE(project_id, worker_id, attendance_date)

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS expenses (

                id SERIAL PRIMARY KEY,

                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                category VARCHAR(100),

                description TEXT,

                amount NUMERIC(14,2) NOT NULL,

                expense_date DATE DEFAULT CURRENT_DATE,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS payments (

                id SERIAL PRIMARY KEY,

                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                description TEXT,

                amount NUMERIC(14,2) NOT NULL,

                payment_type VARCHAR(30),

                payment_date DATE DEFAULT CURRENT_DATE,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS daily_reports (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                worker_id INTEGER
                    REFERENCES workers(id)
                    ON DELETE SET NULL,

                engineer_name VARCHAR(200),

                report_date DATE DEFAULT CURRENT_DATE,

                title VARCHAR(250),

                description TEXT,

                quantity VARCHAR(150),

                materials_used TEXT,

                problems TEXT,

                engineer_review TEXT,

                status VARCHAR(30) DEFAULT 'في الانتظار',

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS report_photos (

                id SERIAL PRIMARY KEY,

                report_id INTEGER NOT NULL
                    REFERENCES daily_reports(id)
                    ON DELETE CASCADE,

                image_url TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS appointments (

                id SERIAL PRIMARY KEY,

                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                title VARCHAR(250) NOT NULL,

                description TEXT,

                appointment_date DATE,

                appointment_time TIME,

                location VARCHAR(300),

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS meetings (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                title VARCHAR(250) NOT NULL,

                description TEXT,

                meeting_date TIMESTAMP,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS messages (

                id SERIAL PRIMARY KEY,

                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                sender_name VARCHAR(200) NOT NULL,

                sender_role VARCHAR(100),

                message TEXT NOT NULL,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE TABLE IF NOT EXISTS notifications (

                id SERIAL PRIMARY KEY,

                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE CASCADE,

                recipient_name VARCHAR(200),

                title VARCHAR(250),

                message TEXT,

                is_read BOOLEAN DEFAULT FALSE,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);

/* =========================================================
   PRO DATABASE TABLES
========================================================= */

/* ---------------------------------------------------------
   EQUIPMENT
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS equipment (

        id SERIAL PRIMARY KEY,

        name VARCHAR(200) NOT NULL,

        type VARCHAR(150),

        registration VARCHAR(100),

        brand VARCHAR(150),

        model VARCHAR(150),

        year INTEGER,

        status VARCHAR(50) DEFAULT 'متاح',

        current_project_id INTEGER
            REFERENCES projects(id)
            ON DELETE SET NULL,

        purchase_price NUMERIC(14,2) DEFAULT 0,

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   EQUIPMENT MAINTENANCE
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS equipment_maintenance (

        id SERIAL PRIMARY KEY,

        equipment_id INTEGER NOT NULL
            REFERENCES equipment(id)
            ON DELETE CASCADE,

        maintenance_type VARCHAR(150),

        description TEXT,

        amount NUMERIC(14,2) DEFAULT 0,

        maintenance_date DATE DEFAULT CURRENT_DATE,

        next_date DATE,

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   EQUIPMENT FUEL
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS equipment_fuel (

        id SERIAL PRIMARY KEY,

        equipment_id INTEGER NOT NULL
            REFERENCES equipment(id)
            ON DELETE CASCADE,

        project_id INTEGER
            REFERENCES projects(id)
            ON DELETE SET NULL,

        quantity NUMERIC(14,3) DEFAULT 0,

        amount NUMERIC(14,2) DEFAULT 0,

        fuel_date DATE DEFAULT CURRENT_DATE,

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   CLIENTS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS clients (

        id SERIAL PRIMARY KEY,

        name VARCHAR(200) NOT NULL,

        phone VARCHAR(50),

        email VARCHAR(150),

        address VARCHAR(300),

        company VARCHAR(200),

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   SUPPLIERS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS suppliers (

        id SERIAL PRIMARY KEY,

        name VARCHAR(200) NOT NULL,

        phone VARCHAR(50),

        email VARCHAR(150),

        address VARCHAR(300),

        company VARCHAR(200),

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   INVOICES
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS invoices (

        id SERIAL PRIMARY KEY,

        invoice_number VARCHAR(100) UNIQUE NOT NULL,

        project_id INTEGER
            REFERENCES projects(id)
            ON DELETE SET NULL,

        client_id INTEGER
            REFERENCES clients(id)
            ON DELETE SET NULL,

        invoice_date DATE DEFAULT CURRENT_DATE,

        due_date DATE,

        subtotal NUMERIC(14,2) DEFAULT 0,

        tax NUMERIC(14,2) DEFAULT 0,

        discount NUMERIC(14,2) DEFAULT 0,

        total NUMERIC(14,2) DEFAULT 0,

        paid NUMERIC(14,2) DEFAULT 0,

        status VARCHAR(50) DEFAULT 'غير مدفوعة',

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   INVOICE ITEMS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS invoice_items (

        id SERIAL PRIMARY KEY,

        invoice_id INTEGER NOT NULL
            REFERENCES invoices(id)
            ON DELETE CASCADE,

        description VARCHAR(300) NOT NULL,

        quantity NUMERIC(14,3) DEFAULT 1,

        unit_price NUMERIC(14,2) DEFAULT 0,

        total NUMERIC(14,2) DEFAULT 0

    );

`);


/* ---------------------------------------------------------
   CLIENT PAYMENTS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS client_payments (

        id SERIAL PRIMARY KEY,

        client_id INTEGER
            REFERENCES clients(id)
            ON DELETE SET NULL,

        project_id INTEGER
            REFERENCES projects(id)
            ON DELETE SET NULL,

        invoice_id INTEGER
            REFERENCES invoices(id)
            ON DELETE SET NULL,

        amount NUMERIC(14,2) NOT NULL,

        payment_method VARCHAR(50),

        payment_date DATE DEFAULT CURRENT_DATE,

        reference VARCHAR(200),

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   STOCK SUPPLIERS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS material_purchases (

        id SERIAL PRIMARY KEY,

        material_id INTEGER NOT NULL
            REFERENCES materials(id)
            ON DELETE CASCADE,

        supplier_id INTEGER
            REFERENCES suppliers(id)
            ON DELETE SET NULL,

        quantity NUMERIC(14,3) NOT NULL,

        unit_price NUMERIC(14,2) DEFAULT 0,

        total NUMERIC(14,2) DEFAULT 0,

        purchase_date DATE DEFAULT CURRENT_DATE,

        invoice_number VARCHAR(100),

        notes TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   USER ACCOUNTS
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS users (

        id SERIAL PRIMARY KEY,

        name VARCHAR(200) NOT NULL,

        phone VARCHAR(50) UNIQUE,

        email VARCHAR(150) UNIQUE,

        password_hash TEXT,

        role VARCHAR(50) DEFAULT 'admin',

        active BOOLEAN DEFAULT TRUE,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   AUDIT LOG
--------------------------------------------------------- */

await pool.query(`

    CREATE TABLE IF NOT EXISTS audit_logs (

        id SERIAL PRIMARY KEY,

        user_id INTEGER
            REFERENCES users(id)
            ON DELETE SET NULL,

        action VARCHAR(100),

        entity_type VARCHAR(100),

        entity_id INTEGER,

        description TEXT,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

    );

`);


/* ---------------------------------------------------------
   PROJECT CLIENT RELATION
--------------------------------------------------------- */

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS client_id INTEGER
REFERENCES clients(id)
ON DELETE SET NULL;


/* ---------------------------------------------------------
   PROJECT COST CACHE
--------------------------------------------------------- */

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14,2)
DEFAULT 0;


/* ---------------------------------------------------------
   PROJECT REVENUE CACHE
--------------------------------------------------------- */

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(14,2)
DEFAULT 0;


/* ---------------------------------------------------------
   PROJECT ARCHIVE
--------------------------------------------------------- */

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS archived BOOLEAN
DEFAULT FALSE;


/* ---------------------------------------------------------
   MATERIAL STOCK CACHE
--------------------------------------------------------- */

ALTER TABLE materials
ADD COLUMN IF NOT EXISTS current_stock NUMERIC(14,3)
DEFAULT 0;


/* ---------------------------------------------------------
   MATERIAL MINIMUM STOCK
--------------------------------------------------------- */

ALTER TABLE materials
ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC(14,3)
DEFAULT 0;


/* ---------------------------------------------------------
   MATERIAL DEFAULT PRICE
--------------------------------------------------------- */

ALTER TABLE materials
ADD COLUMN IF NOT EXISTS default_price NUMERIC(14,2)
DEFAULT 0;


/* ---------------------------------------------------------
   WORKER ADDRESS
--------------------------------------------------------- */

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS address VARCHAR(300);


/* ---------------------------------------------------------
   WORKER NOTES
--------------------------------------------------------- */

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS notes TEXT;


/* ---------------------------------------------------------
   WORKER HIRE DATE
--------------------------------------------------------- */

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS hire_date DATE;


/* ---------------------------------------------------------
   WORKER ID CARD
--------------------------------------------------------- */

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS national_id VARCHAR(100);


/* ---------------------------------------------------------
   PROJECT UPDATED INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_projects_status
ON projects(status);


/* ---------------------------------------------------------
   WORKER INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_workers_active
ON workers(active);


/* ---------------------------------------------------------
   STOCK INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_stock_material
ON stock_movements(material_id);


/* ---------------------------------------------------------
   EXPENSE INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_expenses_project
ON expenses(project_id);


/* ---------------------------------------------------------
   PAYMENT INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_payments_project
ON payments(project_id);


/* ---------------------------------------------------------
   NOTIFICATION INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_notifications_read
ON notifications(is_read);


/* ---------------------------------------------------------
   AUDIT INDEX
--------------------------------------------------------- */

CREATE INDEX IF NOT EXISTS idx_audit_created
ON audit_logs(created_at);
        console.log(
            "✅ PostgreSQL database initialized successfully"
        );

    } catch (error) {

        console.error(
            "❌ Database initialization error:",
            error.message
        );

    }

}


/* =========================================================
   HEALTH
========================================================= */

app.get("/api/health", async (req, res) => {

    try {

        const result = await pool.query(
            "SELECT NOW() AS time"
        );

        res.json({

            success: true,

            app: "دنيا العمران والترقية",

            status: "online",

            database: "connected",

            serverTime: result.rows[0].time

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            app: "دنيا العمران والترقية",

            status: "online",

            database: "error",

            message: error.message

        });

    }

});


/* =========================================================
   DASHBOARD
========================================================= */

app.get("/api/dashboard", async (req, res) => {

    try {

        const projects =
            await pool.query(
                "SELECT COUNT(*) FROM projects"
            );


        const workers =
            await pool.query(
                "SELECT COUNT(*) FROM workers WHERE active = TRUE"
            );


        const materials =
            await pool.query(
                "SELECT COUNT(*) FROM materials"
            );


        const appointments =
            await pool.query(`

                SELECT COUNT(*)

                FROM appointments

                WHERE appointment_date = CURRENT_DATE

            `);


        const expenses =
            await pool.query(`

                SELECT COALESCE(SUM(amount),0)

                FROM expenses

                WHERE expense_date = CURRENT_DATE

            `);


        res.json({

            success: true,

            stats: {

                projects:
                    Number(projects.rows[0].count),

                workers:
                    Number(workers.rows[0].count),

                materials:
                    Number(materials.rows[0].count),

                todayAppointments:
                    Number(appointments.rows[0].count),

                todayExpenses:
                    Number(
                        expenses.rows[0].coalesce || 0
                    ),

                stockValue: 0

            }

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                "خطأ في تحميل بيانات لوحة التحكم"

        });

    }

});


/* =========================================================
   PROJECTS - GET ALL
========================================================= */

app.get("/api/projects", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT *

                FROM projects

                ORDER BY created_at DESC

            `);


        res.json({

            success: true,

            projects: result.rows

        });

    } catch (error) {

        console.error(
            "GET PROJECTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

});


/* =========================================================
   CREATE PROJECT
========================================================= */

app.post("/api/projects", async (req, res) => {

    try {

        const {

            name,
            location,
            client_name,
            engineer_name,
            start_date,
            end_date,
            budget,
            progress,
            status,
            notes

        } = req.body;


        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم المشروع مطلوب"

            });

        }


        const safeProgress = Math.min(
            100,
            Math.max(
                0,
                Number(progress) || 0
            )
        );


        const result =
            await pool.query(`

                INSERT INTO projects (

                    name,
                    location,
                    client_name,
                    engineer_name,
                    start_date,
                    end_date,
                    budget,
                    progress,
                    status,
                    notes

                )

                VALUES (

                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10

                )

                RETURNING *

            `, [

                String(name).trim(),

                location || null,

                client_name || null,

                engineer_name || null,

                start_date || null,

                end_date || null,

                Number(budget) || 0,

                safeProgress,

                status || "جاري",

                notes || null

            ]);


        res.status(201).json({

            success: true,

            project: result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE PROJECT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إنشاء المشروع"

        });

    }

});


/* =========================================================
   UPDATE PROJECT
========================================================= */

app.put("/api/projects/:id", async (req, res) => {

    try {

        const projectId =
            Number(req.params.id);


        if (!Number.isInteger(projectId)) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع غير صحيح"

            });

        }


        const {

            name,
            location,
            client_name,
            engineer_name,
            start_date,
            end_date,
            budget,
            progress,
            status,
            notes

        } = req.body;


        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم المشروع مطلوب"

            });

        }


        const safeProgress =
            Math.min(
                100,
                Math.max(
                    0,
                    Number(progress) || 0
                )
            );


        const result =
            await pool.query(`

                UPDATE projects

                SET

                    name = $1,

                    location = $2,

                    client_name = $3,

                    engineer_name = $4,

                    start_date = $5,

                    end_date = $6,

                    budget = $7,

                    progress = $8,

                    status = $9,

                    notes = $10,

                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $11

                RETURNING *

            `, [

                String(name).trim(),

                location || null,

                client_name || null,

                engineer_name || null,

                start_date || null,

                end_date || null,

                Number(budget) || 0,

                safeProgress,

                status || "جاري",

                notes || null,

                projectId

            ]);


        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });

        }


        res.json({

            success: true,

            message:
                "تم تحديث المشروع بنجاح",

            project:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "UPDATE PROJECT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحديث المشروع"

        });

    }

});


/* =========================================================
   SINGLE PROJECT
========================================================= */

app.get("/api/projects/:id", async (req, res) => {

    try {

        const projectId =
            Number(req.params.id);


        if (!Number.isInteger(projectId)) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع غير صحيح"

            });

        }


        const project =
            await pool.query(

                `

                SELECT *

                FROM projects

                WHERE id = $1

                `,

                [projectId]

            );


        if (!project.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });

        }


        const workers =
            await pool.query(`

                SELECT

                    w.*,

                    pw.role,

                    pw.joined_at

                FROM project_workers pw

                JOIN workers w
                    ON w.id = pw.worker_id

                WHERE pw.project_id = $1

                ORDER BY w.name

            `, [projectId]);


        const materials =
            await pool.query(`

                SELECT

                    pm.*,

                    m.name,

                    m.unit

                FROM project_materials pm

                JOIN materials m
                    ON m.id = pm.material_id

                WHERE pm.project_id = $1

                ORDER BY m.name

            `, [projectId]);


        const expenses =
            await pool.query(`

                SELECT *

                FROM expenses

                WHERE project_id = $1

                ORDER BY expense_date DESC

            `, [projectId]);


        const reports =
            await pool.query(`

                SELECT *

                FROM daily_reports

                WHERE project_id = $1

                ORDER BY
                    report_date DESC,
                    created_at DESC

            `, [projectId]);


        const appointments =
            await pool.query(`

                SELECT *

                FROM appointments

                WHERE project_id = $1

                ORDER BY
                    appointment_date DESC,
                    appointment_time DESC

            `, [projectId]);


        res.json({

            success: true,

            project:
                project.rows[0],

            workers:
                workers.rows,

            materials:
                materials.rows,

            expenses:
                expenses.rows,

            reports:
                reports.rows,

            appointments:
                appointments.rows

        });

    } catch (error) {

        console.error(
            "GET SINGLE PROJECT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                error.message

        });

    }

});


/* =========================================================
   WORKERS
========================================================= */


/* =========================================================
   GET ALL WORKERS
========================================================= */

app.get("/api/workers", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT

                    id,

                    name,

                    phone,

                    job,

                    salary,

                    active,

                    created_at

                FROM workers

                ORDER BY
                    created_at DESC,
                    name ASC

            `);


        res.json({

            success: true,

            workers:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET WORKERS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل العمال"

        });

    }

});


/* =========================================================
   ADD WORKER
========================================================= */

app.post("/api/workers", async (req, res) => {

    try {

        const {

            name,
            phone,
            job,
            salary,
            active

        } = req.body;


        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم العامل مطلوب"

            });

        }


        const result =
            await pool.query(`

                INSERT INTO workers (

                    name,

                    phone,

                    job,

                    salary,

                    active

                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )

                RETURNING *

            `, [

                String(name).trim(),

                phone
                    ? String(phone).trim()
                    : null,

                job
                    ? String(job).trim()
                    : null,

                Number(salary) || 0,

                active !== false

            ]);


        res.status(201).json({

            success: true,

            worker:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "ADD WORKER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة العامل"

        });

    }

});


/* =========================================================
   UPDATE WORKER
========================================================= */

app.put("/api/workers/:id", async (req, res) => {

    try {

        const workerId =
            Number(req.params.id);


        if (!Number.isInteger(workerId)) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم العامل غير صحيح"

            });

        }


        const {

            name,
            phone,
            job,
            salary,
            active

        } = req.body;


        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم العامل مطلوب"

            });

        }


        const result =
            await pool.query(`

                UPDATE workers

                SET

                    name = $1,

                    phone = $2,

                    job = $3,

                    salary = $4,

                    active = $5

                WHERE id = $6

                RETURNING *

            `, [

                String(name).trim(),

                phone
                    ? String(phone).trim()
                    : null,

                job
                    ? String(job).trim()
                    : null,

                Number(salary) || 0,

                active !== false,

                workerId

            ]);


        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "العامل غير موجود"

            });

        }


        res.json({

            success: true,

            worker:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "UPDATE WORKER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تعديل العامل"

        });

    }

});


/* =========================================================
   DELETE WORKER
========================================================= */

app.delete("/api/workers/:id", async (req, res) => {

    try {

        const workerId =
            Number(req.params.id);


        if (!Number.isInteger(workerId)) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم العامل غير صحيح"

            });

        }


        const result =
            await pool.query(`

                DELETE FROM workers

                WHERE id = $1

                RETURNING id

            `, [workerId]);


        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "العامل غير موجود"

            });

        }


        res.json({

            success: true,

            message:
                "تم حذف العامل بنجاح"

        });

    } catch (error) {

        console.error(
            "DELETE WORKER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر حذف العامل"

        });

    }

});


/* =========================================================
   ADD WORKER TO PROJECT
========================================================= */

app.post("/api/project-workers", async (req, res) => {

    try {

        const {

            project_id,
            worker_id,
            role

        } = req.body;


        if (
            !project_id ||
            !worker_id ||
            !role ||
            !String(role).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "بيانات العامل والمشروع والدور مطلوبة"

            });

        }


        const projectId =
            Number(project_id);

        const workerId =
            Number(worker_id);


        if (
            !Number.isInteger(projectId) ||
            !Number.isInteger(workerId)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع أو العامل غير صحيح"

            });

        }


        /* -------------------------------------------------
           CHECK PROJECT
        ------------------------------------------------- */

        const project =
            await pool.query(`

                SELECT id

                FROM projects

                WHERE id = $1

            `, [projectId]);


        if (!project.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });

        }


        /* -------------------------------------------------
           CHECK WORKER
        ------------------------------------------------- */

        const worker =
            await pool.query(`

                SELECT id

                FROM workers

                WHERE id = $1

            `, [workerId]);


        if (!worker.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "العامل غير موجود"

            });

        }


        /* -------------------------------------------------
           ADD / UPDATE PROJECT WORKER
        ------------------------------------------------- */

        const result =
            await pool.query(`

                INSERT INTO project_workers (

                    project_id,

                    worker_id,

                    role

                )

                VALUES (

                    $1,

                    $2,

                    $3

                )

                ON CONFLICT (project_id, worker_id)

                DO UPDATE SET

                    role = EXCLUDED.role

                RETURNING *

            `, [

                projectId,

                workerId,

                String(role).trim()

            ]);


        res.status(201).json({

            success: true,

            message:
                "تمت إضافة العامل للمشروع بنجاح",

            projectWorker:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "ADD WORKER TO PROJECT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة العامل للمشروع"

        });

    }

});


/* =========================================================
   UPDATE WORKER ROLE IN PROJECT
========================================================= */

app.put(
    "/api/project-workers/:workerId",
    async (req, res) => {

        try {

            const workerId =
                Number(req.params.workerId);

            const projectId =
                Number(req.query.project_id);

            const {
                role
            } = req.body;


            if (
                !Number.isInteger(workerId) ||
                !Number.isInteger(projectId)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم العامل أو المشروع غير صحيح"

                });

            }


            if (
                !role ||
                !String(role).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "دور العامل مطلوب"

                });

            }


            const result =
                await pool.query(`

                    UPDATE project_workers

                    SET role = $1

                    WHERE worker_id = $2

                    AND project_id = $3

                    RETURNING *

                `, [

                    String(role).trim(),

                    workerId,

                    projectId

                ]);


            if (!result.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "العامل غير مرتبط بهذا المشروع"

                });

            }


            res.json({

                success: true,

                message:
                    "تم تعديل دور العامل بنجاح",

                projectWorker:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "UPDATE PROJECT WORKER ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تعديل دور العامل"

            });

        }

    }
);


/* =========================================================
   REMOVE WORKER FROM PROJECT
========================================================= */

app.delete(
    "/api/project-workers/:workerId",
    async (req, res) => {

        try {

            const workerId =
                Number(req.params.workerId);

            const projectId =
                Number(req.query.project_id);


            if (
                !Number.isInteger(workerId) ||
                !Number.isInteger(projectId)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم العامل أو المشروع غير صحيح"

                });

            }


            const result =
                await pool.query(`

                    DELETE FROM project_workers

                    WHERE worker_id = $1

                    AND project_id = $2

                    RETURNING *

                `, [

                    workerId,

                    projectId

                ]);


            if (!result.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "العامل غير مرتبط بهذا المشروع"

                });

            }


            res.json({

                success: true,

                message:
                    "تمت إزالة العامل من المشروع بنجاح"

            });

        } catch (error) {

            console.error(
                "REMOVE WORKER FROM PROJECT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر إزالة العامل من المشروع"

            });

        }

    }
);


/* =========================================================
   DELETE PROJECT
========================================================= */

app.delete("/api/projects/:id", async (req, res) => {

    try {

        const projectId =
            Number(req.params.id);


        if (!Number.isInteger(projectId)) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع غير صحيح"

            });

        }


        const result =
            await pool.query(`

                DELETE FROM projects

                WHERE id = $1

                RETURNING id, name

            `, [projectId]);


        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });

        }


        res.json({

            success: true,

            message:
                "تم حذف المشروع بنجاح",

            project:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "DELETE PROJECT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر حذف المشروع"

        });

    }

});


/* =========================================================
   PROJECT FULL DETAILS
========================================================= */

app.get(
    "/api/projects/:id/full",
    async (req, res) => {

        try {

            const projectId =
                Number(req.params.id);


            if (!Number.isInteger(projectId)) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم المشروع غير صحيح"

                });

            }


            /* -------------------------------------------------
               PROJECT
            ------------------------------------------------- */

            const projectResult =
                await pool.query(

                    `

                    SELECT *

                    FROM projects

                    WHERE id = $1

                    `,

                    [projectId]

                );


            if (!projectResult.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "المشروع غير موجود"

                });

            }


            /* -------------------------------------------------
               WORKERS
            ------------------------------------------------- */

            const workersResult =
                await pool.query(

                    `

                    SELECT

                        w.id,

                        w.name,

                        w.phone,

                        w.job,

                        w.salary,

                        w.active,

                        pw.role,

                        pw.joined_at

                    FROM project_workers pw

                    JOIN workers w
                        ON w.id = pw.worker_id

                    WHERE pw.project_id = $1

                    ORDER BY w.name

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               MATERIALS
            ------------------------------------------------- */

            const materialsResult =
                await pool.query(

                    `

                    SELECT

                        pm.id,

                        pm.quantity,

                        pm.used_quantity,

                        pm.unit_price,

                        pm.supplier,

                        m.id AS material_id,

                        m.name,

                        m.unit,

                        m.description

                    FROM project_materials pm

                    JOIN materials m
                        ON m.id = pm.material_id

                    WHERE pm.project_id = $1

                    ORDER BY m.name

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               EXPENSES
            ------------------------------------------------- */

            const expensesResult =
                await pool.query(

                    `

                    SELECT *

                    FROM expenses

                    WHERE project_id = $1

                    ORDER BY
                        expense_date DESC,
                        created_at DESC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               DAILY REPORTS
            ------------------------------------------------- */

            const reportsResult =
                await pool.query(

                    `

                    SELECT

                        dr.*,

                        w.name AS worker_name

                    FROM daily_reports dr

                    LEFT JOIN workers w
                        ON w.id = dr.worker_id

                    WHERE dr.project_id = $1

                    ORDER BY
                        dr.report_date DESC,
                        dr.created_at DESC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               APPOINTMENTS
            ------------------------------------------------- */

            const appointmentsResult =
                await pool.query(

                    `

                    SELECT *

                    FROM appointments

                    WHERE project_id = $1

                    ORDER BY

                        appointment_date ASC,

                        appointment_time ASC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               MEETINGS
            ------------------------------------------------- */

            const meetingsResult =
                await pool.query(

                    `

                    SELECT *

                    FROM meetings

                    WHERE project_id = $1

                    ORDER BY meeting_date DESC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               MESSAGES
            ------------------------------------------------- */

            const messagesResult =
                await pool.query(

                    `

                    SELECT *

                    FROM messages

                    WHERE project_id = $1

                    ORDER BY created_at ASC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               NOTIFICATIONS
            ------------------------------------------------- */

            const notificationsResult =
                await pool.query(

                    `

                    SELECT *

                    FROM notifications

                    WHERE project_id = $1

                    ORDER BY created_at DESC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               ATTENDANCE
            ------------------------------------------------- */

            const attendanceResult =
                await pool.query(

                    `

                    SELECT

                        a.*,

                        w.name AS worker_name,

                        w.job

                    FROM attendance a

                    JOIN workers w
                        ON w.id = a.worker_id

                    WHERE a.project_id = $1

                    ORDER BY

                        a.attendance_date DESC,

                        w.name ASC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               STOCK MOVEMENTS
            ------------------------------------------------- */

            const stockResult =
                await pool.query(

                    `

                    SELECT

                        sm.*,

                        m.name AS material_name,

                        m.unit

                    FROM stock_movements sm

                    JOIN materials m
                        ON m.id = sm.material_id

                    WHERE sm.project_id = $1

                    ORDER BY
                        sm.movement_date DESC

                    `,

                    [projectId]

                );


            /* -------------------------------------------------
               RESPONSE
            ------------------------------------------------- */

            res.json({

                success: true,

                project:
                    projectResult.rows[0],

                workers:
                    workersResult.rows,

                materials:
                    materialsResult.rows,

                expenses:
                    expensesResult.rows,

                reports:
                    reportsResult.rows,

                appointments:
                    appointmentsResult.rows,

                meetings:
                    meetingsResult.rows,

                messages:
                    messagesResult.rows,

                notifications:
                    notificationsResult.rows,

                attendance:
                    attendanceResult.rows,

                stockMovements:
                    stockResult.rows

            });


        } catch (error) {

            console.error(
                "PROJECT FULL DETAILS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل بيانات المشروع"

            });

        }

    }
);


/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.get("*", (req, res) => {

    res.sendFile(

        path.join(

            __dirname,

            "public",

            "index.html"

        )

    );

});


/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    await initDatabase();

    app.listen(
        PORT,
        () => {

            console.log(
                `🏗️ DUNYA-OMRAN running on port ${PORT}`
            );

        }
    );

}


startServer();
