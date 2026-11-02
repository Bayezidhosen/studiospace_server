
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { attachUser, requireAuth } from "./lib/auth.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// Verifies the NextAuth session cookie on every request (attaches req.user).
app.use(attachUser);

const client = new MongoClient(process.env.MONGODB_URI);

let studiosCollection;
let bookingsCollection;

async function connectDB() {
  try {
    await client.connect();

    const database = client.db(
      process.env.DB_NAME || "studiospace"
    );

    studiosCollection = database.collection("studios");
    bookingsCollection = database.collection("bookings");

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

// Get My Studios - Only the authenticated user's listings
app.get("/api/studios/mine", requireAuth, async (req, res) => {
  try {
    const studios = await studiosCollection
      .find({ ownerEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(studios);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch my studios",
    });
  }
});


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


app.post("/api/studios", requireAuth, async (req, res) => {
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
      ownerEmail: req.user.email,
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


app.patch("/api/studios/:id", requireAuth, async (req, res) => {
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
      { _id: new ObjectId(id), ownerEmail: req.user.email },
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


app.delete("/api/studios/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const result = await studiosCollection.deleteOne({
      _id: new ObjectId(id),
      ownerEmail: req.user.email,
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


app.post("/api/bookings", requireAuth, async (req, res) => {
  try {
    const { studioId, date, message } = req.body;

    if (!studioId || !date) {
      return res.status(400).json({
        message: "Studio ID and date are required",
      });
    }

    if (!ObjectId.isValid(studioId)) {
      return res.status(400).json({
        message: "Invalid studio ID",
      });
    }

    const studio = await studiosCollection.findOne({
      _id: new ObjectId(studioId),
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    const newBooking = {
      studioId: new ObjectId(studioId),
      userEmail: req.user.email,
      date,
      message: message || "",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await bookingsCollection.insertOne(newBooking);

    res.status(201).json({
      message: "Booking created successfully",
      insertedId: result.insertedId,
    });

  } catch (error) {
    res.status(500).json({
      message: "Failed to create booking",
    });
  }
});


app.get("/api/bookings/my", requireAuth, async (req, res) => {
  try {
    const bookings = await bookingsCollection
      .find({ userEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

   
    const studioIds = [
      ...new Set(bookings.map((booking) => booking.studioId.toString())),
    ].map((id) => new ObjectId(id));

    const studios = await studiosCollection
      .find({ _id: { $in: studioIds } })
      .project({ title: 1 })
      .toArray();

    const studioById = new Map(
      studios.map((studio) => [studio._id.toString(), studio])
    );

    const result = bookings.map(({ studioId, ...booking }) => ({
      ...booking,
      studio: studioById.get(studioId.toString()) || null,
      studioId: studioId,
    }));

    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch my bookings",
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
