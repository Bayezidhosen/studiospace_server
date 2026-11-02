
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
  })
);

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let studiosCollection;

async function connectDB() {
  try {
    await client.connect();

    const database = client.db(
      process.env.DB_NAME || "studiospace"
    );

    studiosCollection = database.collection("studios");

    console.log("MongoDB Connected Successfully!");

  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

// Server Test
app.get("/", (req, res) => {
  res.send("StudioSpace Server is Running!");
});

// Get Featured Studios - Maximum 6
app.get("/api/studios/featured", async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json(studios);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch featured studios",
    });
  }
});

// Get All Studios
app.get("/api/studios", async (req, res) => {
  try {
    const { category, search } = req.query;

    const filter = {};

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.title = {
        $regex: search,
        $options: "i",
      };
    }

    const studios = await studiosCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studios",
    });
  }
});

// Get Single Studio
app.get("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    res.status(200).json(studio);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch studio",
    });
  }
});

// Add New Studio
app.post("/api/studios", async (req, res) => {
  try {
    const studioData = req.body;

    if (
      !studioData.title ||
      !studioData.category ||
      !studioData.location
    ) {
      return res.status(400).json({
        message: "Title, category and location are required",
      });
    }

    const newStudio = {
      ...studioData,
      hourlyRate: Number(studioData.hourlyRate),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await studiosCollection.insertOne(newStudio);

    res.status(201).json({
      message: "Studio created successfully",
      insertedId: result.insertedId,
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to create studio",
    });
  }
});

// Update Studio
app.patch("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const { _id, createdAt, ...updateData } = req.body;

    if (updateData.hourlyRate !== undefined) {
      updateData.hourlyRate = Number(updateData.hourlyRate);
    }

    updateData.updatedAt = new Date();

    const result = await studiosCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    res.status(200).json({
      message: "Studio updated successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to update studio",
    });
  }
});

// Delete Studio
app.delete("/api/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const result = await studiosCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    res.status(200).json({
      message: "Studio deleted successfully",
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to delete studio",
    });
  }
});

// Start Server After Database Connection
async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`StudioSpace Server running on port ${PORT}`);
  });
}

startServer();
