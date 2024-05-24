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
  } app.post('/check', (req, res) => {
    const { college_code } = req.body;
    const sql = 'SELECT * FROM colleges.College WHERE college_code = ?';
  
    pool.query(sql, [college_code], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
  
        if (results.length === 0) {
            return res.status(404).json({ error: 'College code not found' });
        }
  
        // College code exists
        return res.status(200).json({ success: true, message: 'College code found' });
    });
  });
  
  app.post('/check', (req, res) => {
    const { college_code } = req.body;
    const sql = 'SELECT * FROM ${databasecollege}.College WHERE college_code = ?';
  
    pool.query(sql, [college_code], (err, results) => {
        if (err) {
            console.error('Error executing query:', err);
            return res.status(500).json({ error: 'Internal server error' });
        }
  
        if (results.length === 0) {
            return res.status(404).json({ error: 'College code not found' });
        }
  
        // College code exists
        return res.status(200).json({ success: true, message: 'College code found' });
    });
  });
  
  
  app.post('/login', (req, res) => {
  const { studentId, collegeCode, password } = req.body;

  // Check if all required parameters are provided
  if (!studentId || !collegeCode || !password) {
    return res.status(400).json({ error: 'studentId, collegeCode, and password are required parameters' });
  }

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
      s.profile_img AS profile_img, 
      c.college_code
    FROM 
    ${collegeName}.Student s
    JOIN 
    ${databasecollege}.College c ON s.college_id = c.CollegeID
    WHERE 
      s.studentid = ? AND c.college_code = ? AND s.password = ?
  `;

  // Execute the query with studentId, collegeCode, and password as parameters
  pool.query(sql, [studentId, collegeCode, password], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    // Check if any rows were returned
    if (results.length === 0) {
      // No student found with the provided studentId, collegeCode, and password
      return res.status(404).json({ error: 'Student not found or invalid credentials' });
    } else {
      // Student information found, send the profile_img directly as Base64 in the response
      const student = results[0];

      // Verify password (already matched in the query)
      if (student.password !== password) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      // Send the student data along with the Base64 image
      const responseData = {
        success: true,
        message: 'Successfully logged in',
        data: {
          studentid: student.studentid,
          Name: student.Name,
          std: student.std,
          roll_no: student.roll_no,
          division: student.division,
          stud_dob: student.stud_dob,
          mobile: student.mobile,
          college_code: student.college_code,
          profile_img: student.profile_img ? student.profile_img.toString('base64') : null
        }
      };

      return res.status(200).json(responseData);
    }
  });
});


  
       
      
    
        
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
