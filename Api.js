const express = require('express');
const mysql = require('mysql2'); // Use mysql2 instead of mysql
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 4000;
const databasecollege = process.env.DATABASE_COLLEGE;
const collegeName = process.env.COLLEGE_NAME;

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// MySQL Connection Pool with proper authPlugins option
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 100,
  authPlugins: {
    mysql_clear_password: () => () => Buffer.from(process.env.DB_PASSWORD + '\0')
  }
});

// Custom query function to execute SQL queries
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query(sql, params, (err, rows) => {
        connection.release();

        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  });
};

function bufferToBase64(buffer) {
    return Buffer.from(buffer).toString('base64');
  } 
app.post('/check', async (req, res) => {
  const { college_code } = req.body;
  const sql = `SELECT * FROM ${databasecollege}.College WHERE college_code = ?`;

  try {
    const [results] = await pool.query(sql, [college_code]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'College code not found' });
    }

    // College code exists
    return res.status(200).json({ success: true, message: 'College code found' });
  } catch (error) {
    console.error('Error executing query:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/login', async (req, res) => {
  const { studentId, collegeCode, password } = req.body;

  // Check if all required parameters are provided
  if (!studentId || !collegeCode || !password) {
    return res.status(400).json({ error: 'studentId, collegeCode, and password are required parameters' });
  }

  try {
    // Define the SQL query to fetch student information and match the password
    const sql = `
      SELECT 
        s.studentid, 
        s.Name, 
        s.std, 
        s.roll_no, 
        s.division, 
        s.stud_dob, 
        s.mobile, 
        s.password, 
        TO_BASE64(s.profile_img) AS profile_img, 
        c.college_code
      FROM 
        ${collegeName}.Student s
      JOIN 
        ${databasecollege}.College c ON s.college_id = c.CollegeID
      WHERE 
        s.studentid = ? AND c.college_code = ? AND s.password = ?
    `;

    // Execute the query with studentId, collegeCode, and password as parameters
    const [results] = await pool.query(sql, [studentId, collegeCode, password]);

    // Check if any rows were returned
    if (results.length === 0) {
      // No student found with the provided studentId, collegeCode, and password
      return res.status(404).json({ error: 'Student not found or invalid credentials' });
    }

    // Student information found, convert profile_img to base64 and return it as JSON response
    const student = results[0];
    const base64ProfileImg = student.profile_img ? Buffer.from(student.profile_img, 'binary').toString('base64') : null;
    const studentData = { ...student, profile_img: base64ProfileImg };

    // Verify password (already matched in the query)
    if (student.password !== password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    return res.status(200).json({ success: true, message: 'Successfully logged in', data: studentData });
  } catch (error) {
    console.error('Error executing query:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/dashboard', async (req, res) => {
  try {
    // Define the SQL query to select dashboard data
    const sql = `SELECT dashboard_id, dashboard_image, dashboard_title FROM colleges.dashboard`;

    // Execute the query asynchronously using pool promise
    const [rows, fields] = await pool.query(sql);

    // Map the results to format the response data
    const rowsWithBase64Image = rows.map(row => ({
      id: row.dashboard_id,
      title: row.dashboard_title,
      image: row.dashboard_image ? `data:image/jpeg;base64,${bufferToBase64(row.dashboard_image)}` : null // Convert image to base64 if available
    }));

    // Return the dashboard data as JSON response
    res.json(rowsWithBase64Image);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


       
      
    
        
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
