const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const crypto = require("crypto");
const { promisify } = require("util");

const scryptAsync = promisify(crypto.scrypt);

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json({ limit: "10mb" }));
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
   HELPERS
========================================================= */

function numberValue(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function integerValue(value) {
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
}

function cleanText(value) {
    if (value === undefined || value === null) return null;

    const text = String(value).trim();

    return text ? text : null;
}

function progressValue(value) {
    return Math.min(
        100,
        Math.max(
            0,
            numberValue(value, 0)
        )
    );
}

/* =========================================================
   AUDIT LOG
========================================================= */

async function logAction(action, entity, entityId = null, details = null) {

    try {

        await pool.query(`
            INSERT INTO audit_logs (
                action,
                entity,
                entity_id,
                details
            )
            VALUES ($1,$2,$3,$4)
        `, [
            action,
            entity,
            entityId,
            details
        ]);

    } catch (error) {

        console.error(
            "AUDIT LOG ERROR:",
            error.message
        );

    }
}

/* =========================================================
   AUTHENTICATION / SECURITY
========================================================= */

function hashToken(token) {

    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}


async function hashPassword(password) {

    const salt =
        crypto
            .randomBytes(16)
            .toString("hex");


    const derivedKey =
        await scryptAsync(
            password,
            salt,
            64
        );


    return `scrypt:${salt}:${Buffer
        .from(derivedKey)
        .toString("hex")}`;
}


async function verifyPassword(
    password,
    storedHash
) {

    try {

        const parts =
            String(
                storedHash || ""
            ).split(":");


        if (
            parts.length !== 3 ||
            parts[0] !== "scrypt"
        ) {

            return false;
        }


        const salt =
            parts[1];


        const storedKey =
            Buffer.from(
                parts[2],
                "hex"
            );


        if (
            !salt ||
            !storedKey.length
        ) {

            return false;
        }


        const derivedKey =
            await scryptAsync(
                password,
                salt,
                storedKey.length
            );


        const derivedBuffer =
            Buffer.from(
                derivedKey
            );


        if (
            storedKey.length !==
            derivedBuffer.length
        ) {

            return false;
        }


        return crypto.timingSafeEqual(
            storedKey,
            derivedBuffer
        );

    } catch (error) {

        console.error(
            "PASSWORD VERIFY ERROR:",
            error
        );

        return false;
    }
}


function createAuthToken() {

    return crypto
        .randomBytes(48)
        .toString("hex");
}

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


    /* ---------------------------------------------------------
       AUTHENTICATION TABLES
    --------------------------------------------------------- */

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,

            username TEXT NOT NULL UNIQUE,

            password_hash TEXT NOT NULL,

            full_name TEXT NOT NULL,

            role TEXT NOT NULL DEFAULT 'engineer',

            active BOOLEAN NOT NULL DEFAULT TRUE,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP,

            last_login TIMESTAMPTZ
        )
    `);


    await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_tokens (
            id SERIAL PRIMARY KEY,

            user_id INTEGER NOT NULL
                REFERENCES users(id)
                ON DELETE CASCADE,

            token_hash TEXT NOT NULL UNIQUE,

            expires_at TIMESTAMPTZ NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_auth_tokens_user_id
        ON auth_tokens(user_id)
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_auth_tokens_expires_at
        ON auth_tokens(expires_at)
    `);

        /* ---------------------------------------------------------
           PROJECTS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           WORKERS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS workers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                phone VARCHAR(50),
                job VARCHAR(150),
                salary NUMERIC(12,2) DEFAULT 0,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           PROJECT WORKERS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           MATERIALS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS materials (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                unit VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           PROJECT MATERIALS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           STOCK MOVEMENTS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           ATTENDANCE
        --------------------------------------------------------- */

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
                UNIQUE(
                    project_id,
                    worker_id,
                    attendance_date
                )
            )
        `);

        /* ---------------------------------------------------------
           EXPENSES
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           PAYMENTS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           DAILY REPORTS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           REPORT PHOTOS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS report_photos (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL
                    REFERENCES daily_reports(id)
                    ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           APPOINTMENTS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           MEETINGS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           MESSAGES
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           NOTIFICATIONS
        --------------------------------------------------------- */

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
            )
        `);

        /* ---------------------------------------------------------
           AUDIT LOGS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id SERIAL PRIMARY KEY,
                action VARCHAR(100),
                entity VARCHAR(100),
                entity_id INTEGER,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           CLIENTS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                phone VARCHAR(50),
                email VARCHAR(200),
                address VARCHAR(300),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           SUPPLIERS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                phone VARCHAR(50),
                email VARCHAR(200),
                address VARCHAR(300),
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           EQUIPMENT
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS equipment (
                id SERIAL PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                type VARCHAR(150),
                registration VARCHAR(100),
                status VARCHAR(50) DEFAULT 'متاح',
                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE SET NULL,
                purchase_date DATE,
                purchase_price NUMERIC(14,2) DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
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
                maintenance_date DATE DEFAULT CURRENT_DATE,
                description TEXT,
                cost NUMERIC(14,2) DEFAULT 0,
                next_date DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           PROJECT STAGES
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS project_stages (
                id SERIAL PRIMARY KEY,
                project_id INTEGER NOT NULL
                    REFERENCES projects(id)
                    ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                progress NUMERIC(5,2) DEFAULT 0,
                status VARCHAR(50) DEFAULT 'لم يبدأ',
                start_date DATE,
                end_date DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           WORKER PAYMENTS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS worker_payments (
                id SERIAL PRIMARY KEY,
                worker_id INTEGER NOT NULL
                    REFERENCES workers(id)
                    ON DELETE CASCADE,
                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE SET NULL,
                amount NUMERIC(14,2) NOT NULL,
                payment_type VARCHAR(50) DEFAULT 'أجرة',
                payment_date DATE DEFAULT CURRENT_DATE,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* ---------------------------------------------------------
           DOCUMENTS
        --------------------------------------------------------- */

        await pool.query(`
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                project_id INTEGER
                    REFERENCES projects(id)
                    ON DELETE CASCADE,
                title VARCHAR(250) NOT NULL,
                document_type VARCHAR(100),
                file_url TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        /* =========================================================
           SAFE DATABASE UPDATES
        ========================================================= */

        await pool.query(`
            ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS client_id INTEGER
        `);

        await pool.query(`
            ALTER TABLE projects
            ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE
        `);

        await pool.query(`
            ALTER TABLE materials
            ADD COLUMN IF NOT EXISTS minimum_stock NUMERIC(14,3) DEFAULT 0
        `);

        await pool.query(`
            ALTER TABLE materials
            ADD COLUMN IF NOT EXISTS default_price NUMERIC(14,2) DEFAULT 0
        `);

        /* =========================================================
           INDEXES
        ========================================================= */

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_projects_status
            ON projects(status)
        `);

                /* =========================================================
           CREATE INITIAL ADMIN
        ========================================================= */

        const adminUsername =
            cleanText(
                process.env.ADMIN_USERNAME
            );

        const adminPassword =
            String(
                process.env.ADMIN_PASSWORD || ""
            );

        const adminName =
            cleanText(
                process.env.ADMIN_NAME ||
                "مدير النظام"
            );


        if (
            adminUsername &&
            adminPassword
        ) {

            if (adminPassword.length < 8) {

                console.warn(
                    "⚠️ ADMIN_PASSWORD يجب أن تكون 8 أحرف على الأقل"
                );

            } else {

                const existingAdmin =
                    await pool.query(
                        `
                        SELECT id
                        FROM users
                        WHERE LOWER(username) =
                              LOWER($1)
                        LIMIT 1
                        `,
                        [adminUsername]
                    );


                if (
                    existingAdmin.rows.length === 0
                ) {

                    const passwordHash =
                        await hashPassword(
                            adminPassword
                        );


                    await pool.query(
                        `
                        INSERT INTO users
                        (
                            username,
                            password_hash,
                            full_name,
                            role,
                            active
                        )

                        VALUES
                        (
                            $1,
                            $2,
                            $3,
                            'admin',
                            TRUE
                        )
                        `,
                        [
                            adminUsername,
                            passwordHash,
                            adminName
                        ]
                    );


                    console.log(
                        "👑 تم إنشاء حساب المدير:",
                        adminUsername
                    );

                } else {

                    console.log(
                        "👑 حساب المدير موجود مسبقاً:",
                        adminUsername
                    );
                }
            }

        } else {

            console.warn(
                "⚠️ ADMIN_USERNAME أو ADMIN_PASSWORD غير موجودين في Render"
            );
        }


        console.log(
            "✅ PostgreSQL database initialized successfully"
        );

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_projects_client
            ON projects(client_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_workers_active
            ON workers(active)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_stock_material
            ON stock_movements(material_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_stock_project
            ON stock_movements(project_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_expenses_project
            ON expenses(project_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_payments_project
            ON payments(project_id)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_notifications_read
            ON notifications(is_read)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_created
            ON audit_logs(created_at)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_date
            ON attendance(attendance_date)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_appointments_date
            ON appointments(appointment_date)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_reports_project
            ON daily_reports(project_id)
        `);

        console.log(
            "✅ PostgreSQL database initialized successfully"
        );

    } catch (error) {

        console.error(
            "❌ Database initialization error:",
            error.message
        );

        throw error;
    }
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function getAuthenticatedUser(req) {

    try {

        const header =
            String(
                req.headers.authorization || ""
            );


        if (
            !header.startsWith("Bearer ")
        ) {

            return null;
        }


        const token =
            header
                .slice(7)
                .trim();


        if (!token) {

            return null;
        }


        const tokenHash =
            hashToken(token);


        const result =
            await pool.query(
                `
                SELECT
                    u.id,
                    u.username,
                    u.full_name,
                    u.role,
                    u.active,
                    u.created_at,
                    u.last_login

                FROM auth_tokens t

                INNER JOIN users u
                    ON u.id = t.user_id

                WHERE
                    t.token_hash = $1

                    AND t.expires_at >
                        CURRENT_TIMESTAMP

                    AND u.active = TRUE

                LIMIT 1
                `,
                [tokenHash]
            );


        return result.rows[0] || null;


    } catch (error) {

        console.error(
            "AUTH USER ERROR:",
            error
        );

        return null;
    }
}



async function requireAuth(
    req,
    res,
    next
) {

    try {

        const user =
            await getAuthenticatedUser(
                req
            );


        if (!user) {

            return res.status(401).json({

                success: false,

                message:
                    "يجب تسجيل الدخول أولاً"

            });
        }


        req.user = user;


        next();


    } catch (error) {

        console.error(
            "AUTH MIDDLEWARE ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "تعذر التحقق من تسجيل الدخول"

        });
    }
}



function requireRole(...roles) {

    return (
        req,
        res,
        next
    ) => {

        if (
            !req.user ||
            !roles.includes(
                req.user.role
            )
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "ليس لديك صلاحية لهذا الإجراء"

            });
        }


        next();
    };
}



/* =========================================================
   LOGIN
========================================================= */

app.post(
    "/api/login",
    async (req, res) => {

        try {

            const username =
                cleanText(
                    req.body.username
                );


            const password =
                String(
                    req.body.password || ""
                );


            if (
                !username ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "أدخل اسم المستخدم وكلمة المرور"

                });
            }


            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        password_hash,
                        full_name,
                        role,
                        active,
                        created_at,
                        last_login

                    FROM users

                    WHERE
                        LOWER(username) =
                        LOWER($1)

                    LIMIT 1
                    `,
                    [username]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        "اسم المستخدم أو كلمة المرور غير صحيحة"

                });
            }


            const user =
                result.rows[0];


            if (!user.active) {

                return res.status(403).json({

                    success: false,

                    message:
                        "هذا الحساب غير مفعل"

                });
            }


            const valid =
                await verifyPassword(
                    password,
                    user.password_hash
                );


            if (!valid) {

                return res.status(401).json({

                    success: false,

                    message:
                        "اسم المستخدم أو كلمة المرور غير صحيحة"

                });
            }


            const token =
                createAuthToken();


            const tokenHash =
                hashToken(token);


            await pool.query(
                `
                DELETE FROM auth_tokens

                WHERE
                    expires_at <=
                    CURRENT_TIMESTAMP
                `
            );


            await pool.query(
                `
                INSERT INTO auth_tokens
                (
                    user_id,
                    token_hash,
                    expires_at
                )

                VALUES
                (
                    $1,
                    $2,
                    CURRENT_TIMESTAMP +
                    INTERVAL '7 days'
                )
                `,
                [
                    user.id,
                    tokenHash
                ]
            );


            await pool.query(
                `
                UPDATE users

                SET
                    last_login =
                    CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [user.id]
            );


            const safeUser = {

                id:
                    user.id,

                username:
                    user.username,

                full_name:
                    user.full_name,

                role:
                    user.role,

                active:
                    user.active
            };


            const redirect = "/index.html";

            res.json({

                success: true,

                message:
                    "تم تسجيل الدخول بنجاح",

                token,

                user:
                    safeUser,

                redirect
            });


        } catch (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "حدث خطأ أثناء تسجيل الدخول"

            });
        }
    }
);



/* =========================================================
   CURRENT USER
========================================================= */

app.get(
    "/api/me",
    requireAuth,
    (req, res) => {

        res.json({

            success: true,

            user:
                req.user

        });
    }
);



/* =========================================================
   LOGOUT
========================================================= */

app.post(
    "/api/logout",
    requireAuth,
    async (req, res) => {

        try {

            const header =
                String(
                    req.headers.authorization || ""
                );


            const token =
                header
                    .slice(7)
                    .trim();


            if (token) {

                await pool.query(
                    `
                    DELETE FROM auth_tokens

                    WHERE
                        token_hash = $1
                    `,
                    [
                        hashToken(token)
                    ]
                );
            }


            res.json({

                success: true,

                message:
                    "تم تسجيل الخروج بنجاح"

            });


        } catch (error) {

            console.error(
                "LOGOUT ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "تعذر تسجيل الخروج"

            });
        }
    }
);
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

        const projects = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM projects
            WHERE COALESCE(archived,FALSE) = FALSE
        `);

        const workers = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM workers
            WHERE active = TRUE
        `);

        const materials = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM materials
        `);

        const appointments = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM appointments
            WHERE appointment_date = CURRENT_DATE
        `);

        const expenses = await pool.query(`
            SELECT COALESCE(SUM(amount),0) AS total
            FROM expenses
            WHERE expense_date = CURRENT_DATE
        `);

        const income = await pool.query(`
            SELECT COALESCE(SUM(amount),0) AS total
            FROM payments
        `);

        const totalExpenses = await pool.query(`
            SELECT COALESCE(SUM(amount),0) AS total
            FROM expenses
        `);

        const stock = await pool.query(`
            SELECT
                COALESCE(
                    SUM(
                        CASE
                            WHEN LOWER(movement_type)
                                IN ('in','دخل','دخول','شراء','إضافة')
                            THEN quantity * unit_price
                            ELSE -(quantity * unit_price)
                        END
                    ),
                    0
                ) AS value
            FROM stock_movements
        `);

        const activeProjects = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM projects
            WHERE status = 'جاري'
            AND COALESCE(archived,FALSE) = FALSE
        `);

        const completedProjects = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM projects
            WHERE status IN ('مكتمل','منتهي')
            AND COALESCE(archived,FALSE) = FALSE
        `);

        const delayedProjects = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM projects
            WHERE
                end_date < CURRENT_DATE
                AND progress < 100
                AND COALESCE(archived,FALSE) = FALSE
        `);

        const lowStock = await pool.query(`
            SELECT
                m.id,
                m.name,
                m.unit,
                m.minimum_stock,

                COALESCE(
                    SUM(
                        CASE
                            WHEN LOWER(sm.movement_type)
                                IN ('in','دخل','دخول','شراء','إضافة')
                            THEN sm.quantity
                            ELSE -sm.quantity
                        END
                    ),
                    0
                ) AS current_stock

            FROM materials m

            LEFT JOIN stock_movements sm
                ON sm.material_id = m.id

            GROUP BY
                m.id,
                m.name,
                m.unit,
                m.minimum_stock

            HAVING
                m.minimum_stock > 0
                AND COALESCE(
                    SUM(
                        CASE
                            WHEN LOWER(sm.movement_type)
                                IN ('in','دخل','دخول','شراء','إضافة')
                            THEN sm.quantity
                            ELSE -sm.quantity
                        END
                    ),
                    0
                ) <= m.minimum_stock

            ORDER BY current_stock ASC
        `);

        const activity = await pool.query(`
            SELECT
                id,
                action,
                entity,
                entity_id,
                details,
                created_at
            FROM audit_logs
            ORDER BY created_at DESC
            LIMIT 10
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
                    Number(expenses.rows[0].total || 0),

                stockValue:
                    Number(stock.rows[0].value || 0),

                totalIncome:
                    Number(income.rows[0].total || 0),

                totalExpenses:
                    Number(totalExpenses.rows[0].total || 0),

                balance:
                    Number(income.rows[0].total || 0) -
                    Number(totalExpenses.rows[0].total || 0),

                activeProjects:
                    Number(activeProjects.rows[0].count),

                completedProjects:
                    Number(completedProjects.rows[0].count),

                delayedProjects:
                    Number(delayedProjects.rows[0].count),

                lowStock:
                    lowStock.rows

            },

            activity:
                activity.rows

        });

    } catch (error) {

        console.error(
            "DASHBOARD ERROR:",
            error
        );

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

        const search =
            cleanText(req.query.search);

        const status =
            cleanText(req.query.status);

        let sql = `
            SELECT
                p.*,
                c.name AS client_display_name
            FROM projects p
            LEFT JOIN clients c
                ON c.id = p.client_id
            WHERE COALESCE(p.archived,FALSE) = FALSE
        `;

        const params = [];

        if (search) {

            params.push(`%${search}%`);

            sql += `
                AND (
                    p.name ILIKE $${params.length}
                    OR p.location ILIKE $${params.length}
                    OR p.client_name ILIKE $${params.length}
                )
            `;
        }

        if (status) {

            params.push(status);

            sql += `
                AND p.status = $${params.length}
            `;
        }

        sql += `
            ORDER BY p.created_at DESC
        `;

        const result =
            await pool.query(sql, params);

        res.json({

            success: true,

            projects:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET PROJECTS ERROR:",
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
   CREATE PROJECT
========================================================= */

app.post("/api/projects", async (req, res) => {

    try {

        const {
            name,
            location,
            client_name,
            client_id,
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
            progressValue(progress);

        const result =
            await pool.query(`

                INSERT INTO projects (

                    name,
                    location,
                    client_name,
                    client_id,
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
                    $6,$7,$8,$9,$10,$11
                )

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(location),

                cleanText(client_name),

                integerValue(client_id),

                cleanText(engineer_name),

                start_date || null,

                end_date || null,

                numberValue(budget),

                safeProgress,

                cleanText(status) || "جاري",

                cleanText(notes)

            ]);

        const project =
            result.rows[0];

        await logAction(
            "إنشاء",
            "project",
            project.id,
            project.name
        );

        res.status(201).json({

            success: true,

            project

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
            integerValue(req.params.id);

        if (!projectId) {

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
            client_id,
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

        const result =
            await pool.query(`

                UPDATE projects

                SET

                    name = $1,
                    location = $2,
                    client_name = $3,
                    client_id = $4,
                    engineer_name = $5,
                    start_date = $6,
                    end_date = $7,
                    budget = $8,
                    progress = $9,
                    status = $10,
                    notes = $11,
                    updated_at = CURRENT_TIMESTAMP

                WHERE id = $12

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(location),

                cleanText(client_name),

                integerValue(client_id),

                cleanText(engineer_name),

                start_date || null,

                end_date || null,

                numberValue(budget),

                progressValue(progress),

                cleanText(status) || "جاري",

                cleanText(notes),

                projectId

            ]);

        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });
        }

        await logAction(
            "تعديل",
            "project",
            projectId,
            result.rows[0].name
        );

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
   ARCHIVE PROJECT
========================================================= */

app.put(
    "/api/projects/:id/archive",
    async (req, res) => {

        try {

            const id =
                integerValue(req.params.id);

            if (!id) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم المشروع غير صحيح"

                });
            }

            const result =
                await pool.query(`

                    UPDATE projects

                    SET
                        archived = TRUE,
                        status = 'مؤرشف',
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $1

                    RETURNING *

                `, [id]);

            if (!result.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "المشروع غير موجود"

                });
            }

            await logAction(
                "أرشفة",
                "project",
                id,
                result.rows[0].name
            );

            res.json({

                success: true,

                message:
                    "تم أرشفة المشروع بنجاح",

                project:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "ARCHIVE PROJECT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر أرشفة المشروع"

            });

        }

    }
);

/* =========================================================
   PROJECT FULL DETAILS
   IMPORTANT: THIS ROUTE MUST BE BEFORE /api/projects/:id
========================================================= */

app.get(
    "/api/projects/:id/full",
    async (req, res) => {

        try {

            const projectId =
                integerValue(req.params.id);

            if (!projectId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم المشروع غير صحيح"

                });
            }

            const projectResult =
                await pool.query(`

                    SELECT
                        p.*,
                        c.name AS client_display_name,
                        c.phone AS client_phone,
                        c.email AS client_email
                    FROM projects p
                    LEFT JOIN clients c
                        ON c.id = p.client_id
                    WHERE p.id = $1

                `, [projectId]);

            if (!projectResult.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "المشروع غير موجود"

                });
            }

            const workersResult =
                await pool.query(`

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

                `, [projectId]);

            const materialsResult =
                await pool.query(`

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

                `, [projectId]);

            const expensesResult =
                await pool.query(`

                    SELECT *

                    FROM expenses

                    WHERE project_id = $1

                    ORDER BY
                        expense_date DESC,
                        created_at DESC

                `, [projectId]);

            const paymentsResult =
                await pool.query(`

                    SELECT *

                    FROM payments

                    WHERE project_id = $1

                    ORDER BY
                        payment_date DESC,
                        created_at DESC

                `, [projectId]);

            const reportsResult =
                await pool.query(`

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

                `, [projectId]);

            const appointmentsResult =
                await pool.query(`

                    SELECT *

                    FROM appointments

                    WHERE project_id = $1

                    ORDER BY
                        appointment_date ASC,
                        appointment_time ASC

                `, [projectId]);

            const meetingsResult =
                await pool.query(`

                    SELECT *

                    FROM meetings

                    WHERE project_id = $1

                    ORDER BY meeting_date DESC

                `, [projectId]);

            const messagesResult =
                await pool.query(`

                    SELECT *

                    FROM messages

                    WHERE project_id = $1

                    ORDER BY created_at ASC

                `, [projectId]);

            const notificationsResult =
                await pool.query(`

                    SELECT *

                    FROM notifications

                    WHERE project_id = $1

                    ORDER BY created_at DESC

                `, [projectId]);

            const attendanceResult =
                await pool.query(`

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

                `, [projectId]);

            const stockResult =
                await pool.query(`

                    SELECT

                        sm.*,
                        m.name AS material_name,
                        m.unit

                    FROM stock_movements sm

                    JOIN materials m
                        ON m.id = sm.material_id

                    WHERE sm.project_id = $1

                    ORDER BY sm.movement_date DESC

                `, [projectId]);

            const stagesResult =
                await pool.query(`

                    SELECT *

                    FROM project_stages

                    WHERE project_id = $1

                    ORDER BY created_at ASC

                `, [projectId]);

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

                payments:
                    paymentsResult.rows,

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
                    stockResult.rows,

                stages:
                    stagesResult.rows

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
   SINGLE PROJECT
========================================================= */

app.get("/api/projects/:id", async (req, res) => {

    try {

        const projectId =
            integerValue(req.params.id);

        if (!projectId) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع غير صحيح"

            });
        }

        const result =
            await pool.query(`

                SELECT *

                FROM projects

                WHERE id = $1

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

            project:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "GET PROJECT ERROR:",
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
   DELETE PROJECT
========================================================= */

app.delete("/api/projects/:id", async (req, res) => {

    try {

        const projectId =
            integerValue(req.params.id);

        if (!projectId) {

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

                RETURNING id,name

            `, [projectId]);

        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المشروع غير موجود"

            });
        }

        await logAction(
            "حذف",
            "project",
            projectId,
            result.rows[0].name
        );

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
   WORKERS - GET
========================================================= */

app.get("/api/workers", async (req, res) => {

    try {

        const search =
            cleanText(req.query.search);

        let sql = `
            SELECT
                id,
                name,
                phone,
                job,
                salary,
                active,
                created_at
            FROM workers
            WHERE 1=1
        `;

        const params = [];

        if (search) {

            params.push(`%${search}%`);

            sql += `
                AND (
                    name ILIKE $1
                    OR phone ILIKE $1
                    OR job ILIKE $1
                )
            `;
        }

        sql += `
            ORDER BY
                created_at DESC,
                name ASC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

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

                VALUES ($1,$2,$3,$4,$5)

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(phone),

                cleanText(job),

                numberValue(salary),

                active !== false

            ]);

        const worker =
            result.rows[0];

        await logAction(
            "إضافة",
            "worker",
            worker.id,
            worker.name
        );

        res.status(201).json({

            success: true,

            worker

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
            integerValue(req.params.id);

        if (!workerId) {

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

                cleanText(phone),

                cleanText(job),

                numberValue(salary),

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

        await logAction(
            "تعديل",
            "worker",
            workerId,
            result.rows[0].name
        );

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
            integerValue(req.params.id);

        if (!workerId) {

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

                RETURNING id,name

            `, [workerId]);

        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "العامل غير موجود"

            });
        }

        await logAction(
            "حذف",
            "worker",
            workerId,
            result.rows[0].name
        );

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

app.post(
    "/api/project-workers",
    async (req, res) => {

        try {

            const projectId =
                integerValue(req.body.project_id);

            const workerId =
                integerValue(req.body.worker_id);

            const role =
                cleanText(req.body.role);

            if (
                !projectId ||
                !workerId ||
                !role
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "بيانات العامل والمشروع والدور مطلوبة"

                });
            }

            const result =
                await pool.query(`

                    INSERT INTO project_workers (

                        project_id,
                        worker_id,
                        role

                    )

                    VALUES ($1,$2,$3)

                    ON CONFLICT (
                        project_id,
                        worker_id
                    )

                    DO UPDATE SET
                        role = EXCLUDED.role

                    RETURNING *

                `, [

                    projectId,
                    workerId,
                    role

                ]);

            await logAction(
                "ربط عامل",
                "project_worker",
                result.rows[0].id,
                `project:${projectId} worker:${workerId}`
            );

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

    }
);

/* =========================================================
   UPDATE WORKER ROLE
========================================================= */

app.put(
    "/api/project-workers/:workerId",
    async (req, res) => {

        try {

            const workerId =
                integerValue(req.params.workerId);

            const projectId =
                integerValue(req.query.project_id);

            const role =
                cleanText(req.body.role);

            if (
                !workerId ||
                !projectId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم العامل أو المشروع غير صحيح"

                });
            }

            if (!role) {

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

                    WHERE
                        worker_id = $2
                        AND project_id = $3

                    RETURNING *

                `, [

                    role,
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
                integerValue(req.params.workerId);

            const projectId =
                integerValue(req.query.project_id);

            if (
                !workerId ||
                !projectId
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

                    WHERE
                        worker_id = $1
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
                "REMOVE WORKER ERROR:",
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
   MATERIALS - GET
========================================================= */

app.get("/api/materials", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT

                    m.*,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN LOWER(sm.movement_type)
                                    IN (
                                        'in',
                                        'دخل',
                                        'دخول',
                                        'شراء',
                                        'إضافة'
                                    )
                                THEN sm.quantity
                                ELSE -sm.quantity
                            END
                        ),
                        0
                    ) AS current_stock

                FROM materials m

                LEFT JOIN stock_movements sm
                    ON sm.material_id = m.id

                GROUP BY m.id

                ORDER BY m.name ASC

            `);

        res.json({

            success: true,

            materials:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET MATERIALS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل المواد"

        });

    }

});

/* =========================================================
   CREATE MATERIAL
========================================================= */

app.post("/api/materials", async (req, res) => {

    try {

        const {
            name,
            unit,
            description,
            minimum_stock,
            default_price
        } = req.body;

        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم المادة مطلوب"

            });
        }

        const result =
            await pool.query(`

                INSERT INTO materials (

                    name,
                    unit,
                    description,
                    minimum_stock,
                    default_price

                )

                VALUES ($1,$2,$3,$4,$5)

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(unit),

                cleanText(description),

                numberValue(minimum_stock),

                numberValue(default_price)

            ]);

        await logAction(
            "إضافة",
            "material",
            result.rows[0].id,
            result.rows[0].name
        );

        res.status(201).json({

            success: true,

            material:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE MATERIAL ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة المادة"

        });

    }

});

/* =========================================================
   UPDATE MATERIAL
========================================================= */

app.put("/api/materials/:id", async (req, res) => {

    try {

        const id =
            integerValue(req.params.id);

        if (!id) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المادة غير صحيح"

            });
        }

        const {
            name,
            unit,
            description,
            minimum_stock,
            default_price
        } = req.body;

        const result =
            await pool.query(`

                UPDATE materials

                SET

                    name = $1,
                    unit = $2,
                    description = $3,
                    minimum_stock = $4,
                    default_price = $5

                WHERE id = $6

                RETURNING *

            `, [

                String(name || "").trim(),

                cleanText(unit),

                cleanText(description),

                numberValue(minimum_stock),

                numberValue(default_price),

                id

            ]);

        if (!result.rows.length) {

            return res.status(404).json({

                success: false,

                message:
                    "المادة غير موجودة"

            });
        }

        res.json({

            success: true,

            material:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "UPDATE MATERIAL ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تعديل المادة"

        });

    }

});

/* =========================================================
   STOCK MOVEMENTS - GET
========================================================= */

app.get(
    "/api/stock-movements",
    async (req, res) => {

        try {

            const materialId =
                integerValue(req.query.material_id);

            let sql = `

                SELECT

                    sm.*,

                    m.name AS material_name,
                    m.unit,

                    p.name AS project_name

                FROM stock_movements sm

                JOIN materials m
                    ON m.id = sm.material_id

                LEFT JOIN projects p
                    ON p.id = sm.project_id

                WHERE 1=1

            `;

            const params = [];

            if (materialId) {

                params.push(materialId);

                sql += `
                    AND sm.material_id = $1
                `;

            }

            sql += `
                ORDER BY sm.movement_date DESC
            `;

            const result =
                await pool.query(
                    sql,
                    params
                );

            res.json({

                success: true,

                movements:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET STOCK ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل حركة المخزون"

            });

        }

    }
);

/* =========================================================
   CREATE STOCK MOVEMENT
========================================================= */

app.post(
    "/api/stock-movements",
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const {
                project_id,
                material_id,
                movement_type,
                quantity,
                unit_price,
                supplier,
                notes,
                movement_date
            } = req.body;

            const materialId =
                integerValue(material_id);

            const projectId =
                integerValue(project_id);

            const qty =
                numberValue(quantity);

            if (
                !materialId ||
                qty <= 0 ||
                !cleanText(movement_type)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "المادة ونوع الحركة والكمية مطلوبة"

                });

            }

            await client.query("BEGIN");

            const result =
                await client.query(`

                    INSERT INTO stock_movements (

                        project_id,
                        material_id,
                        movement_type,
                        quantity,
                        unit_price,
                        supplier,
                        notes,
                        movement_date

                    )

                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7,
                        COALESCE($8,CURRENT_TIMESTAMP)
                    )

                    RETURNING *

                `, [

                    projectId,

                    materialId,

                    cleanText(movement_type),

                    qty,

                    numberValue(unit_price),

                    cleanText(supplier),

                    cleanText(notes),

                    movement_date || null

                ]);

            await client.query("COMMIT");

            await logAction(
                "حركة مخزون",
                "stock",
                result.rows[0].id,
                `material:${materialId} quantity:${qty}`
            );

            res.status(201).json({

                success: true,

                movement:
                    result.rows[0]

            });

        } catch (error) {

            await client.query("ROLLBACK");

            console.error(
                "CREATE STOCK ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تسجيل حركة المخزون"

            });

        } finally {

            client.release();

        }

    }
);

/* =========================================================
   EXPENSES - GET
========================================================= */

app.get("/api/expenses", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                e.*,

                p.name AS project_name

            FROM expenses e

            LEFT JOIN projects p
                ON p.id = e.project_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND e.project_id = $1
            `;

        }

        sql += `
            ORDER BY
                e.expense_date DESC,
                e.created_at DESC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            expenses:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET EXPENSES ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل المصاريف"

        });

    }

});

/* =========================================================
   CREATE EXPENSE
========================================================= */

app.post("/api/expenses", async (req, res) => {

    try {

        const {
            project_id,
            category,
            description,
            amount,
            expense_date
        } = req.body;

        const value =
            numberValue(amount);

        if (value <= 0) {

            return res.status(400).json({

                success: false,

                message:
                    "قيمة المصروف يجب أن تكون أكبر من صفر"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO expenses (

                    project_id,
                    category,
                    description,
                    amount,
                    expense_date

                )

                VALUES (
                    $1,$2,$3,$4,
                    COALESCE($5,CURRENT_DATE)
                )

                RETURNING *

            `, [

                integerValue(project_id),

                cleanText(category),

                cleanText(description),

                value,

                expense_date || null

            ]);

        await logAction(
            "إضافة مصروف",
            "expense",
            result.rows[0].id,
            String(value)
        );

        res.status(201).json({

            success: true,

            expense:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE EXPENSE ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة المصروف"

        });

    }

});

/* =========================================================
   PAYMENTS - GET
========================================================= */

app.get("/api/payments", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                pay.*,

                p.name AS project_name

            FROM payments pay

            LEFT JOIN projects p
                ON p.id = pay.project_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND pay.project_id = $1
            `;

        }

        sql += `
            ORDER BY
                pay.payment_date DESC,
                pay.created_at DESC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            payments:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET PAYMENTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الدفعات"

        });

    }

});

/* =========================================================
   CREATE PAYMENT
========================================================= */

app.post("/api/payments", async (req, res) => {

    try {

        const {
            project_id,
            description,
            amount,
            payment_type,
            payment_date
        } = req.body;

        const value =
            numberValue(amount);

        if (value <= 0) {

            return res.status(400).json({

                success: false,

                message:
                    "قيمة الدفعة يجب أن تكون أكبر من صفر"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO payments (

                    project_id,
                    description,
                    amount,
                    payment_type,
                    payment_date

                )

                VALUES (
                    $1,$2,$3,$4,
                    COALESCE($5,CURRENT_DATE)
                )

                RETURNING *

            `, [

                integerValue(project_id),

                cleanText(description),

                value,

                cleanText(payment_type),

                payment_date || null

            ]);

        await logAction(
            "إضافة دفعة",
            "payment",
            result.rows[0].id,
            String(value)
        );

        res.status(201).json({

            success: true,

            payment:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE PAYMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة الدفعة"

        });

    }

});

/* =========================================================
   ATTENDANCE
========================================================= */

app.get("/api/attendance", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                a.*,

                w.name AS worker_name,
                w.job

            FROM attendance a

            JOIN workers w
                ON w.id = a.worker_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND a.project_id = $1
            `;

        }

        sql += `
            ORDER BY
                a.attendance_date DESC,
                w.name ASC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            attendance:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET ATTENDANCE ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الحضور"

        });

    }

});

app.post("/api/attendance", async (req, res) => {

    try {

        const {
            project_id,
            worker_id,
            attendance_date,
            status,
            hours,
            notes
        } = req.body;

        const projectId =
            integerValue(project_id);

        const workerId =
            integerValue(worker_id);

        if (!projectId || !workerId) {

            return res.status(400).json({

                success: false,

                message:
                    "المشروع والعامل مطلوبان"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO attendance (

                    project_id,
                    worker_id,
                    attendance_date,
                    status,
                    hours,
                    notes

                )

                VALUES (
                    $1,$2,
                    COALESCE($3,CURRENT_DATE),
                    $4,$5,$6
                )

                ON CONFLICT (
                    project_id,
                    worker_id,
                    attendance_date
                )

                DO UPDATE SET

                    status = EXCLUDED.status,
                    hours = EXCLUDED.hours,
                    notes = EXCLUDED.notes

                RETURNING *

            `, [

                projectId,

                workerId,

                attendance_date || null,

                cleanText(status) || "حاضر",

                numberValue(hours),

                cleanText(notes)

            ]);

        res.status(201).json({

            success: true,

            attendance:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "ATTENDANCE ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تسجيل الحضور"

        });

    }

});

/* =========================================================
   DAILY REPORTS
========================================================= */

app.get("/api/daily-reports", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                dr.*,

                w.name AS worker_name

            FROM daily_reports dr

            LEFT JOIN workers w
                ON w.id = dr.worker_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND dr.project_id = $1
            `;

        }

        sql += `
            ORDER BY
                dr.report_date DESC,
                dr.created_at DESC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            reports:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET REPORTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل التقارير"

        });

    }

});

app.post("/api/daily-reports", async (req, res) => {

    try {

        const {
            project_id,
            worker_id,
            engineer_name,
            report_date,
            title,
            description,
            quantity,
            materials_used,
            problems,
            engineer_review,
            status
        } = req.body;

        const projectId =
            integerValue(project_id);

        if (!projectId) {

            return res.status(400).json({

                success: false,

                message:
                    "المشروع مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO daily_reports (

                    project_id,
                    worker_id,
                    engineer_name,
                    report_date,
                    title,
                    description,
                    quantity,
                    materials_used,
                    problems,
                    engineer_review,
                    status

                )

                VALUES (
                    $1,$2,$3,
                    COALESCE($4,CURRENT_DATE),
                    $5,$6,$7,$8,$9,$10,$11
                )

                RETURNING *

            `, [

                projectId,

                integerValue(worker_id),

                cleanText(engineer_name),

                report_date || null,

                cleanText(title),

                cleanText(description),

                cleanText(quantity),

                cleanText(materials_used),

                cleanText(problems),

                cleanText(engineer_review),

                cleanText(status) || "في الانتظار"

            ]);

        await logAction(
            "تقرير يومي",
            "daily_report",
            result.rows[0].id,
            result.rows[0].title
        );

        res.status(201).json({

            success: true,

            report:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE REPORT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إنشاء التقرير"

        });

    }

});

/* =========================================================
   APPOINTMENTS
========================================================= */

app.get("/api/appointments", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT

                    a.*,

                    p.name AS project_name

                FROM appointments a

                LEFT JOIN projects p
                    ON p.id = a.project_id

                ORDER BY
                    a.appointment_date ASC,
                    a.appointment_time ASC

            `);

        res.json({

            success: true,

            appointments:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET APPOINTMENTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل المواعيد"

        });

    }

});

app.post("/api/appointments", async (req, res) => {

    try {

        const {
            project_id,
            title,
            description,
            appointment_date,
            appointment_time,
            location
        } = req.body;

        if (
            !title ||
            !String(title).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "عنوان الموعد مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO appointments (

                    project_id,
                    title,
                    description,
                    appointment_date,
                    appointment_time,
                    location

                )

                VALUES (
                    $1,$2,$3,$4,$5,$6
                )

                RETURNING *

            `, [

                integerValue(project_id),

                String(title).trim(),

                cleanText(description),

                appointment_date || null,

                appointment_time || null,

                cleanText(location)

            ]);

        await logAction(
            "موعد",
            "appointment",
            result.rows[0].id,
            result.rows[0].title
        );

        res.status(201).json({

            success: true,

            appointment:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE APPOINTMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إنشاء الموعد"

        });

    }

});

/* =========================================================
   MEETINGS
========================================================= */

app.get("/api/meetings", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                m.*,

                p.name AS project_name

            FROM meetings m

            JOIN projects p
                ON p.id = m.project_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND m.project_id = $1
            `;

        }

        sql += `
            ORDER BY m.meeting_date DESC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            meetings:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET MEETINGS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الاجتماعات"

        });

    }

});

app.post("/api/meetings", async (req, res) => {

    try {

        const {
            project_id,
            title,
            description,
            meeting_date
        } = req.body;

        const projectId =
            integerValue(project_id);

        if (
            !projectId ||
            !title ||
            !String(title).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "المشروع وعنوان الاجتماع مطلوبان"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO meetings (

                    project_id,
                    title,
                    description,
                    meeting_date

                )

                VALUES ($1,$2,$3,$4)

                RETURNING *

            `, [

                projectId,

                String(title).trim(),

                cleanText(description),

                meeting_date || null

            ]);

        res.status(201).json({

            success: true,

            meeting:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE MEETING ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إنشاء الاجتماع"

        });

    }

});

/* =========================================================
   MESSAGES
========================================================= */

app.get("/api/messages", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        if (!projectId) {

            return res.status(400).json({

                success: false,

                message:
                    "رقم المشروع مطلوب"

            });

        }

        const result =
            await pool.query(`

                SELECT *

                FROM messages

                WHERE project_id = $1

                ORDER BY created_at ASC

            `, [projectId]);

        res.json({

            success: true,

            messages:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET MESSAGES ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الرسائل"

        });

    }

});

app.post("/api/messages", async (req, res) => {

    try {

        const {
            project_id,
            sender_name,
            sender_role,
            message
        } = req.body;

        if (
            !integerValue(project_id) ||
            !cleanText(sender_name) ||
            !cleanText(message)
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "بيانات الرسالة ناقصة"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO messages (

                    project_id,
                    sender_name,
                    sender_role,
                    message

                )

                VALUES ($1,$2,$3,$4)

                RETURNING *

            `, [

                integerValue(project_id),

                cleanText(sender_name),

                cleanText(sender_role),

                cleanText(message)

            ]);

        res.status(201).json({

            success: true,

            message:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE MESSAGE ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إرسال الرسالة"

        });

    }

});

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.get(
    "/api/notifications",
    async (req, res) => {

        try {

            const result =
                await pool.query(`

                    SELECT *

                    FROM notifications

                    ORDER BY created_at DESC

                    LIMIT 100

                `);

            res.json({

                success: true,

                notifications:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET NOTIFICATIONS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل الإشعارات"

            });

        }

    }
);

app.post(
    "/api/notifications",
    async (req, res) => {

        try {

            const {
                project_id,
                recipient_name,
                title,
                message
            } = req.body;

            const result =
                await pool.query(`

                    INSERT INTO notifications (

                        project_id,
                        recipient_name,
                        title,
                        message

                    )

                    VALUES ($1,$2,$3,$4)

                    RETURNING *

                `, [

                    integerValue(project_id),

                    cleanText(recipient_name),

                    cleanText(title),

                    cleanText(message)

                ]);

            res.status(201).json({

                success: true,

                notification:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CREATE NOTIFICATION ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر إنشاء الإشعار"

            });

        }

    }
);

app.put(
    "/api/notifications/:id/read",
    async (req, res) => {

        try {

            const id =
                integerValue(req.params.id);

            const result =
                await pool.query(`

                    UPDATE notifications

                    SET is_read = TRUE

                    WHERE id = $1

                    RETURNING *

                `, [id]);

            if (!result.rows.length) {

                return res.status(404).json({

                    success: false,

                    message:
                        "الإشعار غير موجود"

                });

            }

            res.json({

                success: true,

                notification:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "READ NOTIFICATION ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحديث الإشعار"

            });

        }

    }
);

/* =========================================================
   CLIENTS
========================================================= */

app.get("/api/clients", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT *

                FROM clients

                ORDER BY created_at DESC

            `);

        res.json({

            success: true,

            clients:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET CLIENTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل العملاء"

        });

    }

});

app.post("/api/clients", async (req, res) => {

    try {

        const {
            name,
            phone,
            email,
            address,
            notes
        } = req.body;

        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم العميل مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO clients (

                    name,
                    phone,
                    email,
                    address,
                    notes

                )

                VALUES ($1,$2,$3,$4,$5)

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(phone),

                cleanText(email),

                cleanText(address),

                cleanText(notes)

            ]);

        res.status(201).json({

            success: true,

            client:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE CLIENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة العميل"

        });

    }

});

/* =========================================================
   SUPPLIERS
========================================================= */

app.get("/api/suppliers", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT *

                FROM suppliers

                ORDER BY created_at DESC

            `);

        res.json({

            success: true,

            suppliers:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET SUPPLIERS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الموردين"

        });

    }

});

app.post("/api/suppliers", async (req, res) => {

    try {

        const {
            name,
            phone,
            email,
            address,
            notes
        } = req.body;

        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم المورد مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO suppliers (

                    name,
                    phone,
                    email,
                    address,
                    notes

                )

                VALUES ($1,$2,$3,$4,$5)

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(phone),

                cleanText(email),

                cleanText(address),

                cleanText(notes)

            ]);

        res.status(201).json({

            success: true,

            supplier:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE SUPPLIER ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة المورد"

        });

    }

});

/* =========================================================
   EQUIPMENT
========================================================= */

app.get("/api/equipment", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT

                    e.*,

                    p.name AS project_name

                FROM equipment e

                LEFT JOIN projects p
                    ON p.id = e.project_id

                ORDER BY e.created_at DESC

            `);

        res.json({

            success: true,

            equipment:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET EQUIPMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل المعدات"

        });

    }

});

app.post("/api/equipment", async (req, res) => {

    try {

        const {
            name,
            type,
            registration,
            status,
            project_id,
            purchase_date,
            purchase_price,
            notes
        } = req.body;

        if (
            !name ||
            !String(name).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "اسم المعدة مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO equipment (

                    name,
                    type,
                    registration,
                    status,
                    project_id,
                    purchase_date,
                    purchase_price,
                    notes

                )

                VALUES (
                    $1,$2,$3,$4,
                    $5,$6,$7,$8
                )

                RETURNING *

            `, [

                String(name).trim(),

                cleanText(type),

                cleanText(registration),

                cleanText(status) || "متاح",

                integerValue(project_id),

                purchase_date || null,

                numberValue(purchase_price),

                cleanText(notes)

            ]);

        res.status(201).json({

            success: true,

            equipment:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE EQUIPMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة المعدة"

        });

    }

});

/* =========================================================
   EQUIPMENT MAINTENANCE
========================================================= */

app.get(
    "/api/equipment-maintenance",
    async (req, res) => {

        try {

            const result =
                await pool.query(`

                    SELECT

                        em.*,

                        e.name AS equipment_name

                    FROM equipment_maintenance em

                    JOIN equipment e
                        ON e.id = em.equipment_id

                    ORDER BY
                        em.maintenance_date DESC

                `);

            res.json({

                success: true,

                maintenance:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET MAINTENANCE ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل الصيانة"

            });

        }

    }
);

app.post(
    "/api/equipment-maintenance",
    async (req, res) => {

        try {

            const {
                equipment_id,
                maintenance_date,
                description,
                cost,
                next_date,
                notes
            } = req.body;

            const equipmentId =
                integerValue(equipment_id);

            if (!equipmentId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "المعدة مطلوبة"

                });

            }

            const result =
                await pool.query(`

                    INSERT INTO equipment_maintenance (

                        equipment_id,
                        maintenance_date,
                        description,
                        cost,
                        next_date,
                        notes

                    )

                    VALUES (
                        $1,
                        COALESCE($2,CURRENT_DATE),
                        $3,$4,$5,$6
                    )

                    RETURNING *

                `, [

                    equipmentId,

                    maintenance_date || null,

                    cleanText(description),

                    numberValue(cost),

                    next_date || null,

                    cleanText(notes)

                ]);

            res.status(201).json({

                success: true,

                maintenance:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CREATE MAINTENANCE ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تسجيل الصيانة"

            });

        }

    }
);

/* =========================================================
   PROJECT STAGES
========================================================= */

app.get(
    "/api/project-stages",
    async (req, res) => {

        try {

            const projectId =
                integerValue(req.query.project_id);

            if (!projectId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "رقم المشروع مطلوب"

                });

            }

            const result =
                await pool.query(`

                    SELECT *

                    FROM project_stages

                    WHERE project_id = $1

                    ORDER BY created_at ASC

                `, [projectId]);

            res.json({

                success: true,

                stages:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET STAGES ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل مراحل المشروع"

            });

        }

    }
);

app.post(
    "/api/project-stages",
    async (req, res) => {

        try {

            const {
                project_id,
                name,
                progress,
                status,
                start_date,
                end_date,
                notes
            } = req.body;

            const projectId =
                integerValue(project_id);

            if (
                !projectId ||
                !name ||
                !String(name).trim()
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "المشروع واسم المرحلة مطلوبان"

                });

            }

            const result =
                await pool.query(`

                    INSERT INTO project_stages (

                        project_id,
                        name,
                        progress,
                        status,
                        start_date,
                        end_date,
                        notes

                    )

                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7
                    )

                    RETURNING *

                `, [

                    projectId,

                    String(name).trim(),

                    progressValue(progress),

                    cleanText(status) || "لم يبدأ",

                    start_date || null,

                    end_date || null,

                    cleanText(notes)

                ]);

            res.status(201).json({

                success: true,

                stage:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CREATE STAGE ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر إضافة المرحلة"

            });

        }

    }
);

/* =========================================================
   WORKER PAYMENTS
========================================================= */

app.get(
    "/api/worker-payments",
    async (req, res) => {

        try {

            const workerId =
                integerValue(req.query.worker_id);

            let sql = `

                SELECT

                    wp.*,

                    w.name AS worker_name,

                    p.name AS project_name

                FROM worker_payments wp

                JOIN workers w
                    ON w.id = wp.worker_id

                LEFT JOIN projects p
                    ON p.id = wp.project_id

                WHERE 1=1

            `;

            const params = [];

            if (workerId) {

                params.push(workerId);

                sql += `
                    AND wp.worker_id = $1
                `;

            }

            sql += `
                ORDER BY
                    wp.payment_date DESC,
                    wp.created_at DESC
            `;

            const result =
                await pool.query(
                    sql,
                    params
                );

            res.json({

                success: true,

                payments:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET WORKER PAYMENTS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل دفعات العمال"

            });

        }

    }
);

app.post(
    "/api/worker-payments",
    async (req, res) => {

        try {

            const {
                worker_id,
                project_id,
                amount,
                payment_type,
                payment_date,
                notes
            } = req.body;

            const workerId =
                integerValue(worker_id);

            const value =
                numberValue(amount);

            if (
                !workerId ||
                value <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "العامل والمبلغ مطلوبان"

                });

            }

            const result =
                await pool.query(`

                    INSERT INTO worker_payments (

                        worker_id,
                        project_id,
                        amount,
                        payment_type,
                        payment_date,
                        notes

                    )

                    VALUES (
                        $1,$2,$3,$4,
                        COALESCE($5,CURRENT_DATE),
                        $6
                    )

                    RETURNING *

                `, [

                    workerId,

                    integerValue(project_id),

                    value,

                    cleanText(payment_type) || "أجرة",

                    payment_date || null,

                    cleanText(notes)

                ]);

            res.status(201).json({

                success: true,

                payment:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CREATE WORKER PAYMENT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تسجيل دفعة العامل"

            });

        }

    }
);

/* =========================================================
   DOCUMENTS
========================================================= */

app.get("/api/documents", async (req, res) => {

    try {

        const projectId =
            integerValue(req.query.project_id);

        let sql = `

            SELECT

                d.*,

                p.name AS project_name

            FROM documents d

            LEFT JOIN projects p
                ON p.id = d.project_id

            WHERE 1=1

        `;

        const params = [];

        if (projectId) {

            params.push(projectId);

            sql += `
                AND d.project_id = $1
            `;

        }

        sql += `
            ORDER BY d.created_at DESC
        `;

        const result =
            await pool.query(
                sql,
                params
            );

        res.json({

            success: true,

            documents:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET DOCUMENTS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل الوثائق"

        });

    }

});

app.post("/api/documents", async (req, res) => {

    try {

        const {
            project_id,
            title,
            document_type,
            file_url,
            notes
        } = req.body;

        if (
            !title ||
            !String(title).trim()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "عنوان الوثيقة مطلوب"

            });

        }

        const result =
            await pool.query(`

                INSERT INTO documents (

                    project_id,
                    title,
                    document_type,
                    file_url,
                    notes

                )

                VALUES ($1,$2,$3,$4,$5)

                RETURNING *

            `, [

                integerValue(project_id),

                String(title).trim(),

                cleanText(document_type),

                cleanText(file_url),

                cleanText(notes)

            ]);

        res.status(201).json({

            success: true,

            document:
                result.rows[0]

        });

    } catch (error) {

        console.error(
            "CREATE DOCUMENT ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر إضافة الوثيقة"

        });

    }

});

/* =========================================================
   PROJECT MATERIAL ASSIGNMENT
========================================================= */

app.post(
    "/api/project-materials",
    async (req, res) => {

        try {

            const {
                project_id,
                material_id,
                quantity,
                used_quantity,
                unit_price,
                supplier
            } = req.body;

            const projectId =
                integerValue(project_id);

            const materialId =
                integerValue(material_id);

            if (
                !projectId ||
                !materialId
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "المشروع والمادة مطلوبان"

                });

            }

            const result =
                await pool.query(`

                    INSERT INTO project_materials (

                        project_id,
                        material_id,
                        quantity,
                        used_quantity,
                        unit_price,
                        supplier

                    )

                    VALUES ($1,$2,$3,$4,$5,$6)

                    ON CONFLICT (
                        project_id,
                        material_id
                    )

                    DO UPDATE SET

                        quantity =
                            EXCLUDED.quantity,

                        used_quantity =
                            EXCLUDED.used_quantity,

                        unit_price =
                            EXCLUDED.unit_price,

                        supplier =
                            EXCLUDED.supplier

                    RETURNING *

                `, [

                    projectId,

                    materialId,

                    numberValue(quantity),

                    numberValue(used_quantity),

                    numberValue(unit_price),

                    cleanText(supplier)

                ]);

            res.status(201).json({

                success: true,

                projectMaterial:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "PROJECT MATERIAL ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر ربط المادة بالمشروع"

            });

        }

    }
);

/* =========================================================
   REPORT PHOTOS
========================================================= */

app.get(
    "/api/report-photos/:reportId",
    async (req, res) => {

        try {

            const reportId =
                integerValue(req.params.reportId);

            const result =
                await pool.query(`

                    SELECT *

                    FROM report_photos

                    WHERE report_id = $1

                    ORDER BY created_at DESC

                `, [reportId]);

            res.json({

                success: true,

                photos:
                    result.rows

            });

        } catch (error) {

            console.error(
                "GET REPORT PHOTOS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر تحميل صور التقرير"

            });

        }

    }
);

app.post(
    "/api/report-photos",
    async (req, res) => {

        try {

            const {
                report_id,
                image_url
            } = req.body;

            if (
                !integerValue(report_id) ||
                !cleanText(image_url)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "التقرير ورابط الصورة مطلوبان"

                });

            }

            const result =
                await pool.query(`

                    INSERT INTO report_photos (

                        report_id,
                        image_url

                    )

                    VALUES ($1,$2)

                    RETURNING *

                `, [

                    integerValue(report_id),

                    cleanText(image_url)

                ]);

            res.status(201).json({

                success: true,

                photo:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "CREATE REPORT PHOTO ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "تعذر إضافة الصورة"

            });

        }

    }
);

/* =========================================================
   AUDIT LOGS
========================================================= */

app.get("/api/audit-logs", async (req, res) => {

    try {

        const result =
            await pool.query(`

                SELECT *

                FROM audit_logs

                ORDER BY created_at DESC

                LIMIT 100

            `);

        res.json({

            success: true,

            logs:
                result.rows

        });

    } catch (error) {

        console.error(
            "GET AUDIT LOGS ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "تعذر تحميل سجل العمليات"

        });

    }

});

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {

    try {

        await initDatabase();

        app.listen(
            PORT,
            () => {

                console.log(
                    `🏗️ DUNYA-OMRAN running on port ${PORT}`
                );

            }
        );

    } catch (error) {

        console.error(
            "❌ SERVER START ERROR:",
            error
        );

        process.exit(1);

    }

}

startServer();
