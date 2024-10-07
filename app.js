const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = 3000;
const pool = new Pool({
  user: "aws_test",
  host: "localhost",
  database: "aws_product_manager",
  password: "ws9609",
  port: 5432,
});

// DB connection test
pool.query("SELECT NOW()", (err) => {
  if (err) {
    console.error("Error connecting to the database", err);
  } else {
    console.log("Successfully connected to the database");
  }
});

// Middleware to parse JSON bodies
app.use(express.json());

app.get("/", (req, res) => {
  res.send("AWS");
});

app.get("/secret", (req, res) => {
  res.send("SUCCESS");
});

// <Stocks>
// CREATE : Add a new stock
app.post("/v1/stocks", async (req, res) => {
  try {
    const { name, amount } = req.body;
    const newStock = await pool.query(
      "INSERT INTO stocks (name, amount) VALUES ($1, $2) RETURNING *",
      [name, amount],
    );
    res.status(201).json(newStock.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

// READ : Get all stocks
app.get("/v1/stocks", async (req, res) => {
  try {
    const allStocks = await pool.query(
      "SELECT name, amount FROM stocks ORDER BY amount ASC",
    );

    // Format the response
    const formattedStocks = allStocks.rows.reduce((acc, stock) => {
      acc[stock.name] = stock.amount;
      return acc;
    }, {});

    res.json(formattedStocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

// READ : Get a stock by name, return name and amount
app.get("/v1/stocks/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const stock = await pool.query("SELECT * FROM stocks WHERE name ILIKE $1", [
      name,
    ]);
    if (stock.rows.length === 0) {
      return res.status(404).send("Stock not found");
    }
    const formattedStock = { [stock.rows[0].name]: stock.rows[0].amount };
    res.json(formattedStock);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

// UPDATE : Update a stock
app.put("/v1/stocks/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { amount } = req.body;
    const updateStock = await pool.query(
      "UPDATE stocks SET amount = $2 WHERE name = $1 RETURNING *",
      [name, amount],
    );
    if (updateStock.rows.length === 0) {
      return res.status(404).send("Stock not found");
    }
    res.json(updateStock.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

// DELETE : Delete all stocks
app.delete("/v1/stocks", async (req, res) => {
  try {
    const deleteResult = await pool.query("DELETE FROM stocks RETURNING *");
    const deletedCount = deleteResult.rowCount;
    if (deletedCount === 0) {
      return res.status(404).send("No stocks to delete");
    }
    res.json({ message: `Successfully deleted ${deletedCount} stocks` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

// <Sales>
// CREATE : Add a new sale
app.post("/v1/sales/", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let { name, amount, price } = req.body;

    if (!name) {
      throw new Error("Name is required");
    }

    // Set amount to 1 if null or undefined
    amount = amount ?? 1;

    console.log("Connected to database");
    await client.query("SELECT 1");
    console.log("Database query successful");

    // Check if the stock exists and has enough amount
    const stockResult = await client.query(
      "SELECT amount FROM stocks WHERE name = $1",
      [name]
    );

    if (stockResult.rows.length === 0) {
      throw new Error("Stock not found");
    }

    const currentStockAmount = stockResult.rows[0].amount;
    if (currentStockAmount < amount) {
      throw new Error("Insufficient stock");
    }

    // Insert the new sale
    const newSale = await client.query(
      "INSERT INTO sales (name, amount, price) VALUES ($1, $2, $3) RETURNING *",
      [name, amount, price !== undefined ? price : null]
    );

    // Update the stock amount
    await client.query(
      "UPDATE stocks SET amount = amount - $1 WHERE name = $2",
      [amount, name]
    );

    await client.query("COMMIT");
    res.status(201).json(newSale.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Detailed error in /v1/sales POST:", err);
    if (
      err.message === "Stock not found" ||
      err.message === "Insufficient stock" ||
      err.message === "Name is required"
    ) {
      res.status(400).json({ message: err.message });
    } else {
      res.status(500).json({ message: "ERROR", details: err.message });
    }
  } finally {
    client.release();
  }
});

// READ : Get total sales
app.get("/v1/sales", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT SUM(amount * price) as total_sales FROM sales",
    );
    const totalSales = result.rows[0].total_sales;
    if (totalSales === null) {
      res.json({ total_sales: 0 });
    } else {
      res.json({ total_sales: parseFloat(totalSales) });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "ERROR" });
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
