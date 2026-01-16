const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

dotenv.config();


const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY
);

serviceAccount.private_key =
  serviceAccount.private_key.replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});


const app = express();
// cors 
app.use(cors());


app.use(express.json());

const PORT = process.env.PORT || 5000;
const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const client = new MongoClient(uri);

// Middleware: verify Firebase idToken
  async function verifyFBToken(req, res, next) {
    const authHeader = (req.headers.authorization || "").trim();
    if (!authHeader.startsWith("Bearer ")) return res.status(401).send({ message: "Missing token" });
    const idToken = authHeader.split(" ")[1];
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      req.token_email = decoded.email;
      req.token_uid = decoded.uid;
      next();
    } catch (err) {
      console.error("Token verify failed:", err);
      res.status(401).send({ message: "Unauthorized" });
    }
  }


let usersCollection;
let jobsCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("freelance_market");
    usersCollection = db.collection("users");
    jobsCollection = db.collection("jobs");
  } catch (err) {
    console.error("DB Connection Error:", err);
  }
}

app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Helper: check admin role
async function isAdmin(email) {
  if (!email) return false;
  const user = await usersCollection.findOne({ email: email.toLowerCase() });
  return !!(user && user.role === "admin");
}

// Public: list jobs with search, filters and pagination
app.get("/allJobs", async (req, res) => {
    try {
      const { q, category, status, page = 1, pageSize = 20, sort = "newest" } = req.query;
      const query = {};
      if (category) query.category = category;
      if (status) query.status = status;
      if (q) query.$text = { $search: q };

      const skip = Math.max(0, (Number(page) - 1)) * Number(pageSize);
      let cursor = jobsCollection.find(query);
      if (sort === "newest") cursor = cursor.sort({ createdAt: -1 });
      const total = await jobsCollection.countDocuments(query);
      const jobs = await cursor.skip(skip).limit(Number(pageSize)).toArray();
      res.send({ total, page: Number(page), pageSize: Number(pageSize), jobs });
    } catch (err) {
      console.error("GET /allJobs error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Public: job details
  app.get("/allJobs/:id", async (req, res) => {
    try {
      const job = await jobsCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!job) return res.status(404).send({ message: "Job not found" });
      res.send(job);
    } catch (err) {
      console.error("GET /allJobs/:id error:", err);
      res.status(400).send({ message: "Invalid id" });
    }
  });

  
  // Create job (authenticated)
  // POST: Add new job
app.post("/allJobs", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.title) return res.status(400).send({ message: "Missing title" });

    const newJob = {
      title: payload.title,
      postedBy: payload.postedBy || "",
      category: payload.category || "Uncategorized",
      summary: payload.summary || "",
      coverImage: payload.coverImage || "",
      userEmail: payload.userEmail || "",
      skills: Array.isArray(payload.skills) ? payload.skills : [],
      experience: payload.experience || "",
      requirements: Array.isArray(payload.requirements) ? payload.requirements : [],
      jobType: payload.jobType || "",
      locationType: payload.locationType || "",
      postedDate: payload.postedDate || new Date().toISOString().split("T")[0],
      salaryRange: payload.salaryRange || "",
      acceptedBy: null, 
      // createdAt: new Date(),
    };

    const r = await jobsCollection.insertOne(newJob);
    res.send({ insertedId: r.insertedId, job: newJob });
  } catch (err) {
    console.error("POST /allJobs error:", err);
    res.status(500).send({ message: "Server error" });
  }
});

  // Update job (owner or admin)
  app.patch("/updateJob/:id", verifyFBToken, async (req, res) => {
    try {
      const id = req.params.id;
      const payload = req.body || {};
      const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
      if (!job) return res.status(404).send({ message: "Job not found" });

      const caller = req.token_email;
      const callerAdmin = await isAdmin(caller);
      if (job.userEmail !== caller && !callerAdmin) return res.status(403).send({ message: "Unauthorized" });

      delete payload._id;
      payload.updatedAt = new Date();
      const result = await jobsCollection.updateOne({ _id: new ObjectId(id) }, { $set: payload });
      res.send(result);
    } catch (err) {
      console.error("PATCH /updateJob error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Delete job (owner or admin)
  app.delete("/deleteJob/:id", verifyFBToken, async (req, res) => {
    try {
      const id = req.params.id;
      const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
      if (!job) return res.status(404).send({ message: "Job not found" });

      const caller = req.token_email;
      const callerAdmin = await isAdmin(caller);
      if (job.userEmail !== caller && !callerAdmin) return res.status(403).send({ message: "Unauthorized" });

      const result = await jobsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    } catch (err) {
      console.error("DELETE /deleteJob error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // My added jobs (query by email)
  app.get("/myAddedJobs", async (req, res) => {
    try {
      const email = (req.query.email || "").toLowerCase();
      if (!email) return res.status(400).send({ message: "Missing email" });
      const jobs = await jobsCollection.find({ userEmail: email }).toArray();
      res.send(jobs);
    } catch (err) {
      console.error("GET /myAddedJobs error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Accepted tasks
  app.get("/my-accepted-tasks", async (req, res) => {
    try {
      const email = (req.query.email || "").toLowerCase();
      if (!email) return res.status(400).send({ message: "Missing email" });
      const jobs = await jobsCollection.find({ acceptedBy: email }).toArray();
      res.send(jobs);
    } catch (err) {
      console.error("GET /my-accepted-tasks error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Accept task (authenticated) - only for yourself or admin
  app.patch("/my-accepted-tasks/:id", async (req, res) => {
  try {
    const { acceptedBy } = req.body;
    if (acceptedBy === undefined) return res.status(400).send({ message: "acceptedBy required" });

    const r = await jobsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { acceptedBy } }
    );

    res.send({ modifiedCount: r.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Server error" });
  }
});

  /* USERS & PROFILE */

  // Upsert user (insert on signup/signin)
  app.post("/users", async (req, res) => {
    try {
      const user = req.body || {};
      if (!user.email) return res.status(400).send({ message: "Missing email" });
      const email = user.email.toLowerCase();
      const now = new Date();
      const update = {
        $set: {
          email,
          name: user.name || user.displayName || "",
          photoURL: user.photoURL || "",
          phone: user.phone || "",
          location: user.location || "",
          bio: user.bio || "",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now, role: user.role || "user" },
      };
      await usersCollection.updateOne({ email }, update, { upsert: true });
      const saved = await usersCollection.findOne({ email });
      res.send(saved);
    } catch (err) {
      console.error("POST /users error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Get user profile
  app.get("/users/:email", async (req, res) => {
    try {
      const email = (req.params.email || "").toLowerCase();
      if (!email) return res.status(400).send({ message: "Missing email" });
      const user = await usersCollection.findOne({ email });
      if (!user) return res.status(404).send({ message: "User not found" });
      res.send(user);
    } catch (err) {
      console.error("GET /users/:email error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Update profile (owner or admin)
  app.put("/users/:email", verifyFBToken, async (req, res) => {
    try {
      const email = (req.params.email || "").toLowerCase();
      if (!email) return res.status(400).send({ message: "Missing email" });
      if (req.token_email !== email) {
        const callerAdmin = await isAdmin(req.token_email);
        if (!callerAdmin) return res.status(403).send({ message: "Forbidden" });
      }
      const payload = req.body || {};
      const now = new Date();
      const update = {
        $set: {
          name: payload.name || "",
          phone: payload.phone || "",
          location: payload.location || "",
          bio: payload.bio || "",
          photoURL: payload.photoURL || "",
          updatedAt: now,
        },
      };
      await usersCollection.updateOne({ email }, update);
      const user = await usersCollection.findOne({ email });
      res.send(user);
    } catch (err) {
      console.error("PUT /users/:email error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  // Admin change role
  app.patch("/users/:email/role", verifyFBToken, async (req, res) => {
    try {
      const caller = req.token_email;
      const callerAdmin = await isAdmin(caller);
      if (!callerAdmin) return res.status(403).send({ message: "Admin only" });
      const email = (req.params.email || "").toLowerCase();
      const { role } = req.body;
      if (!role) return res.status(400).send({ message: "Missing role" });
      await usersCollection.updateOne({ email }, { $set: { role, updatedAt: new Date() } });
      const user = await usersCollection.findOne({ email });
      res.send(user);
    } catch (err) {
      console.error("PATCH /users/:email/role error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  /* DASHBOARD ENDPOINTS */

  app.get("/dashboard/overview", verifyFBToken, async (req, res) => {
    try {
      const totalUsers = await usersCollection.countDocuments();
      const totalJobs = await jobsCollection.countDocuments();
      const activeJobs = await jobsCollection.countDocuments({ status: "active"});
      const recentJobs = await jobsCollection.countDocuments({
  createdAt: {
    $exists: true,
    $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  },
});

      res.send({ totalUsers, totalJobs, activeJobs, recentJobs });
    } catch (err) {
      console.error("GET /dashboard/overview error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  app.get("/dashboard/charts", verifyFBToken, async (req, res) => {
    try {
      const jobsByCategory = await jobsCollection.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray();

      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const jobsByDay = await jobsCollection.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray();

      const usersByDay = await usersCollection.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray();

      res.send({ jobsByCategory, jobsByDay, usersByDay });
    } catch (err) {
      console.error("GET /dashboard/charts error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

  



  app.get("/dashboard/recent", verifyFBToken, async (req, res) => {
    try {
      const recentJobs = await jobsCollection.find().sort({ createdAt: -1 }).limit(10).toArray();
      const recentUsers = await usersCollection.find().sort({ createdAt: -1 }).limit(10).toArray();
      res.send({ recentJobs, recentUsers });
    } catch (err) {
      console.error("GET /dashboard/recent error:", err);
      res.status(500).send({ message: "Server error" });
    }
  });

app.get("/", (req, res) => {
  res.send({ message: "Freelance Market API running" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
