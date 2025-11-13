const express = require ('express');
const cors = require ('cors');
const dotenv = require ('dotenv');
const {MongoClient, ObjectId} = require ('mongodb');

const port = process.env.PORT || 3000;

dotenv.config ();
const app = express ();

app.use (cors ());
app.use (express.json ());

const client = new MongoClient (process.env.MONGO_URI);

async function run () {
  try {
    // await client.connect ();
    const db = client.db ('freelanceDB');
    const jobsCollection = db.collection ('jobs');

    app.get ('/allJobs', async (req, res) => {
      const query = {};
      const jobs = await jobsCollection.find (query).toArray ();
      res.send (jobs);
    });

    app.get ('/allJobs/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId (id)};
      const job = await jobsCollection.findOne (query);
      res.send (job);
    });

    app.post ('/allJobs', async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne (newJob);
      res.send (result);
    });

    app.patch ('/updateJob/:id', async (req, res) => {
      const id = req.params.id;
      const updatedJob = req.body;

      delete updatedJob._id;
      const query = {_id: new ObjectId (id)};
      const update = {
        $set: updatedJob,
      };
      const result = await jobsCollection.updateOne (query, update);
      res.send (result);
    });

    app.delete ('/deleteJob/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId (id)};
      const result = await jobsCollection.deleteOne (query);
      res.send (result);
    });

    app.get ('/myAddedJobs', async (req, res) => {
      const email = req.query.email;
      const query = {postedBy: email};
      const jobs = await jobsCollection.find (query).toArray ();
      res.send (jobs);
    });

    app.get ('/my-accepted-tasks', async (req, res) => {
      const email = req.query.email;
      const query = {acceptedBy: email};
      const jobs = await jobsCollection.find (query).toArray ();
      res.send (jobs);
    });

    app.patch ('/my-accepted-tasks/:id', async (req, res) => {
      const {id} = req.params;
      const {acceptedBy} = req.body;
      const result = await jobsCollection.updateOne (
        {_id: new ObjectId (id)},
        {$set: {acceptedBy}}
      );
      res.send (result);
    });

    app.get ('/myAddedJobs', async (req, res) => {
      const email = req.query.email;
      const query = {userEmail: email};
      const jobs = await jobsCollection.find (query).toArray ();
      res.send (jobs);
    });

    // await client.db ('admin').command ({ping: 1});
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

module.exports = app;


// app.listen (port, () => {
//   console.log (`Freelance Job Portal Server is running on port ${port}`);
// });
