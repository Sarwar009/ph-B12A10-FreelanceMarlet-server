const express = require ('express');
const cors = require ('cors');
const dotenv = require ('dotenv');
const {MongoClient, ServerApiVersion, ObjectId} = require ('mongodb');

const port = process.env.PORT || 3000;  


dotenv.config ();
const app = express ();

app.use (cors ());
app.use (express.json ());

const client = new MongoClient (process.env.MONGO_URI);

async function run () {
  try {
    await client.connect ();
    const db = client.db ('freelanceDB');
    const jobsCollection = db.collection ('jobs');


    app.get ('/allJobs', async (req, res) => {
      const query = {};
      const jobs = await jobsCollection.find (query).toArray ();
      res.send (jobs);
    });

    app.get('/allJobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const job = await jobsCollection.findOne(query);
      res.send(job);
    });

    

    app.post ('/allJobs', async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne (newJob);
        res.send (result);
    });

//     app.patch('/updateJobs/:id', async (req, res) => {
//   const id = req.params.id;

//   if (!ObjectId.isValid(id)) {
//     return res.status(400).json({ error: "Invalid job ID" });
//   }

//   const updatedJob = { ...req.body };
//   delete updatedJob._id; // <-- REMOVE _id to prevent MongoDB error

//   try {
//     const query = { _id: new ObjectId(id) };
//     const update = { $set: updatedJob };
//     const result = await jobsCollection.updateOne(query, update);

//     if (result.modifiedCount === 0) {
//       return res.status(404).json({ error: "Job not found or no changes made" });
//     }

//     res.json({ success: true, result });
//   } catch (err) {
//     console.error("Update error:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });


    app.patch ('/updateJobs/:id', async (req, res) => {
      const id = req.params.id;
      const updatedJob = req.body;
      
          delete updatedJob._id;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: updatedJob,
        };
        const result = await jobsCollection.updateOne (query, update);
        res.send (result);
    });

    app.delete ('/deleteJobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne (query);
      res.send (result);
    });

    app.get('/myAddedJobs', async (req, res) => {
      const email = req.query.email;
      const query = { postedBy: email };
      const jobs = await jobsCollection.find(query).toArray();
      res.send(jobs);
    });

    app.get('/my-accepted-tasks', async (req, res) => {
      const email = req.query.email;
      const query = { acceptedBy: email };
      const jobs = await jobsCollection.find(query).toArray();
      res.send(jobs);
    });


    await client.db ('admin').command ({ping: 1});
    console.log (
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
  }
}
run ().catch (console.dir);

app.get ('/', (req, res) => {
  res.send ('Freelance Job Portal Server is running');
});

app.listen (port, () => {
  console.log (`Freelance Job Portal Server is running on port ${port}`);
});