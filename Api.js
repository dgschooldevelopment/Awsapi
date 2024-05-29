const express = require('express');
const mysql = require('mysql2/promise'); // Use mysql2/promise instead of mysql2
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

app.use(bodyParser.json({ limit: '900mb' })); // Increase limit for JSON request body
app.use(bodyParser.urlencoded({ limit: '900mb', extended: true })); // Increase limit for URL-encoded request body

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
const query = async (sql, params) => {
  const connection = await pool.getConnection();
  try {
    const [rows, fields] = await connection.query(sql, params);
    return rows;
  } catch (error) {
    throw error;
  } finally {
    connection.release();
  }
};

// Function to convert buffer to Base64
function bufferToBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

// Route to check college code
app.post('/check', async (req, res) => {
  try {
    const { college_code } = req.body;
    const sql = 'SELECT * FROM colleges.College WHERE college_code = ?';
    const results = await query(sql, [college_code]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'College code not found' });
    }
    
    return res.status(200).json({ success: true, message: 'College code found' });
  } catch (error) {
    console.error('Error executing query:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to handle login
app.post('/login', async (req, res) => {
  try {
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
    const results = await query(sql, [studentId, collegeCode, password]);

    // Check if any rows were returned
    if (results.length === 0) {
      return res.status(404).json({ error: 'Student not found or invalid credentials' });
    }

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
  } catch (error) {
    console.error('Error executing query:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to fetch dashboard data
app.get('/dashboard', async (req, res) => {
  try {
    // Define the SQL query to select dashboard data
    const sql = `SELECT dashboard_id, dashboard_image, dashboard_title FROM colleges.dashboard`;

    // Execute the query asynchronously using pool promise
    const rows = await query(sql);

    // Map the results to format the response data
    const rowsWithBase64Image = rows.map(row => ({
      id: row.dashboard_id,
      title: row.dashboard_title,
      image: row.dashboard_image ? `${bufferToBase64(row.dashboard_image)}` : null // Convert image to base64 if available
    }));

    // Return the dashboard data as JSON response
    res.json(rowsWithBase64Image);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


   app.get('/subjects', async (req, res) => {
  const { standard } = req.query;

  // Check if standard parameter is provided and valid
  if (!standard) {
    return res.status(400).json({ error: 'Standard parameter is required' });
  }

  try {
    // Define the SQL query to select subject data filtered by standard
    // Define the SQL query to select subject data filtered by standard
const sql = `SELECT subject_code, subject_name, stand, division, subject_code_prefixed, image FROM ${databasecollege}.Subject WHERE stand = ?`;

    // Execute the query with the standard parameter
    const [rows, fields] = await pool.query(sql, [standard]);

    // Map the results to format the response data
    const subjectData = rows.map(subject => ({
      subject_code: subject.subject_code,
      subject_name: subject.subject_name,
      stand: subject.stand,
      division: subject.division,
      subject_code_prefixed: subject.subject_code_prefixed,
      image: subject.image ? bufferToBase64(subject.image) : null // Assuming bufferToBase64 is defined
    }));

    // Return the subject data as JSON response
    res.json(subjectData);
  } catch (err) {
    console.error('Error fetching subject data:', err);
    res.status(500).json({ error: 'Error fetching subject data' });
  }
});


app.get('/homework_pending', async (req, res) => {
  try {
    // Extract parameters from the query string
    const { subjectName, standard, division } = req.query;

    // Debugging: Log the request query
    console.log('Request query:', req.query);

    // Validate required parameters
    if (!subjectName || !standard || !division) {
      console.log('Missing required parameters');
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Define the SQL query for homework_pending
    const sqlHomework = `
      SELECT 
        h.hid,
        h.homeworkp_id,
        h.subject_id,
        h.date_of_given,
        h.description,
        h.image,
        s.subject_name,
        h.standred,
        h.Division,
        t.tname AS teacher_name,
        h.date_of_creation 
      FROM 
        MGVP.homework_pending h
      JOIN 
        colleges.Subject s ON h.subject_id = s.subject_code_prefixed
      JOIN
        MGVP.teacher t ON h.teacher_id = t.teacher_code
      LEFT JOIN
        MGVP.homework_submitted hs ON h.homeworkp_id = hs.homeworkpending_id
      WHERE 
        s.subject_name = ? AND h.standred = ? AND h.Division = ? AND hs.homeworkpending_id IS NULL`;

    // Execute the SQL query asynchronously using pool promise
    const [rowsHomework] = await pool.query(sqlHomework, [subjectName, standard, division]);

    // Debugging: Log the query result
    console.log('Query result:', rowsHomework);

    // Convert images to base64
    const rowsWithBase64ImageHomework = rowsHomework.map(row => ({
      ...row,
      image: row.image ? row.image.toString('base64') : null
    }));

    // Return the homework_pending data with base64 images as JSON response
    res.json(rowsWithBase64ImageHomework);
  } catch (error) {
    console.error('Error fetching homework_pending data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
///////////////////////////////////////////////////////////////////////////////
// Route to fetch submitted homework
/*app.get('/submitted_homework', async (req, res) => {
  const { studentId, subjectName } = req.query;

  const sqlQuery = `
    SELECT
        hs.submitted_id,
        hs.homeworksubmitted_id,
        hs.homeworkpending_id,
        hs.subject_id,
        hs.student_id AS studentid,
        hs.date_of_given_submitted,
        hs.description AS submitted_description,
        hp.date_of_given AS date_of_to_submit,
        hp.description AS pending_description,
        s.subject_name,
        REPLACE(REPLACE(TO_BASE64(isub.image), '\\\\', ''), '\\n', '') AS image_base64
    FROM
        MGVP.homework_submitted hs
    JOIN
        MGVP.homework_pending hp ON hs.homeworkpending_id = hp.homeworkp_id
    JOIN
        colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
    JOIN
        MGVP.image_submitted isub ON hs.homeworksubmitted_id = isub.homeworksubmitted_id
    WHERE
        hs.student_id = ? AND
        s.subject_name = ?`;

  try {
    const [results] = await pool.query(sqlQuery, [studentId, subjectName]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }

    const images = {};
    results.forEach((row, index) => {
      images[`image${index + 1}`] = row.image_base64;
    });

    const response = {
      submitted_id: results[0].submitted_id,
      homeworksubmitted_id: results[0].homeworksubmitted_id,
      homeworkpending_id: results[0].homeworkpending_id,
      subject_id: results[0].subject_id,
      studentid: results[0].studentid,
      date_of_given_submitted: results[0].date_of_given_submitted,
      submitted_description: results[0].submitted_description,
      date_of_to_submit: results[0].date_of_to_submit,
      pending_description: results[0].pending_description,
      subject_name: results[0].subject_name,
      images: images
    };

    res.json(response);
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});*/
/*app.get('/homework_submitted', async (req, res) => {
  const { studentId, subjectName } = req.query;

  const sqlQuery = `
    SELECT
        hs.submitted_id,
        hs.homeworksubmitted_id,
        hs.homeworkpending_id,
        hs.subject_id,
        hs.student_id AS studentid,
        hs.date_of_given_submitted,
        hs.description AS submitted_description,
        hp.date_of_given AS date_of_to_submit,
        hp.description AS pending_description,
        s.subject_name,
          isub.image AS image_data,
        hs.approval_status  -- Add approval_status field here

    FROM
        MGVP.homework_submitted hs
    JOIN
        MGVP.homework_pending hp ON hs.homeworkpending_id = hp.homeworkp_id
    JOIN
        colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
    JOIN
        MGVP.image_submit isub ON hs.submitted_id = isub.homeworksubmitted_id
    WHERE
        hs.student_id = ? AND
        s.subject_name = ?`;

  try {
    const [results] = await pool.query(sqlQuery, [studentId, subjectName]);

    if (results.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }

    const submissions = {};

    results.forEach(row => {
      if (!submissions[row.submitted_id]) {
        submissions[row.submitted_id] = {
          submitted_id: row.submitted_id,
          homeworksubmitted_id: row.homeworksubmitted_id,
          homeworkpending_id: row.homeworkpending_id,
          subject_id: row.subject_id,
          studentid: row.studentid,
          date_of_given_submitted: row.date_of_given_submitted,
          submitted_description: row.submitted_description,
          date_of_to_submit: row.date_of_to_submit,
          pending_description: row.pending_description,
          subject_name: row.subject_name,
          approval_status: row.approval_status, // Include approval_status here
          images: {}
        };
      }
      const imageNumber = Object.keys(submissions[row.submitted_id].images).length + 1;
      submissions[row.submitted_id].images[`image${imageNumber}`] = row.image_base64;
    });

    res.json(Object.values(submissions));
  } catch (error) {
    console.error('Database query failed:', error);
    res.status(500).json({ error: 'Database query failed' });
  }
});*/
app.get('/homework_submitted', async (req, res) => {
    const { studentId, subjectName } = req.query;

    if (!studentId || !subjectName) {
        return res.status(400).json({ error: 'studentId and subjectName are required parameters' });
    }

    const sqlQuery = `
        SELECT
            hs.submitted_id,
            hs.homeworksubmitted_id,
            hs.homeworkpending_id,
            hs.subject_id,
            hs.student_id AS studentid,
            hs.date_of_given_submitted,
            hs.description AS submitted_description,
            hp.date_of_given AS date_of_to_submit,
            hp.description AS pending_description,
            s.subject_name,
            hs.approval_status,
            isub.image AS image_data
        FROM
            MGVP.homework_submitted hs
        JOIN
            MGVP.homework_pending hp ON hs.homeworkpending_id = hp.homeworkp_id
        JOIN
            ${databasecollege}.Subject s ON hs.subject_id = s.subject_code_prefixed
        LEFT JOIN
            MGVP.image_submit isub ON hs.submitted_id = isub.homeworksubmitted_id
        WHERE
            hs.student_id = ? AND
            s.subject_name = ?
    `;

    try {
        const results = await query(sqlQuery, [studentId, subjectName]);

        if (results.length === 0) {
            return res.status(404).json({ error: 'No data found' });
        }

        const submissions = {};

        results.forEach(row => {
            if (!submissions[row.submitted_id]) {
                submissions[row.submitted_id] = {
                    submitted_id: row.submitted_id,
                    homeworksubmitted_id: row.homeworksubmitted_id,
                    homeworkpending_id: row.homeworkpending_id,
                    subject_id: row.subject_id,
                    studentid: row.studentid,
                    date_of_given_submitted: row.date_of_given_submitted,
                    submitted_description: row.submitted_description,
                    date_of_to_submit: row.date_of_to_submit,
                    pending_description: row.pending_description,
                    subject_name: row.subject_name,
                    approval_status: row.approval_status,
                    images: []
                };
            }

            if (row.image_data) {
                submissions[row.submitted_id].images.push(({ row.image_data } ));
            }
        });

        res.json(Object.values(submissions));
    } catch (error) {
        console.error('Database query failed:', error);
        res.status(500).json({ error: 'Database query failed' });
    }
});


/////////////////////////////////////////////////////////////

    /* app.get('/evolution-homework', async (req, res) => {
  const { subject_name, standred, division, student_id } = req.query;

  // Log received query parameters for debugging
  console.log('Received query parameters:', { subject_name, standred, division, student_id });

  if (!subject_name || !standred || !division || !student_id) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  // Queries
  const queries = {
    totalHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_pending hp
    
      JOIN colleges.Subject s ON hp.subject_id = s.subject_code_prefixed
      WHERE s.subject_name = ? AND hp.standred = ? AND hp.Division = ?;
    `,
    approvedHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_submitted hs
      JOIN MGVP.homework_pending hp ON hp.homeworkp_id = hs.homeworkpending_id
      JOIN colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
      WHERE hs.student_id = ? AND hs.approval_status = 1;
    `,
    pendingHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_submitted hs
      JOIN MGVP.homework_pending hp ON hp.homeworkp_id = hs.homeworkpending_id
      JOIN colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
      WHERE hs.student_id = ? AND hs.approval_status = 0;
    `
  };

  const params = {
    totalHomework: [subject_name, standred, division],
    approvedHomework: [student_id],
    pendingHomework: [student_id]
  };

  try {
    // Execute all queries using async/await
    const [totalHomeworkResults] = await pool.query(queries.totalHomework, params.totalHomework);
    const [approvedHomeworkResults] = await pool.query(queries.approvedHomework, params.approvedHomework);
    const [pendingHomeworkResults] = await pool.query(queries.pendingHomework, params.pendingHomework);

    // Combine all results into one response object
    const response = {
      totalHomework: totalHomeworkResults[0].count,
      approvedHomework: approvedHomeworkResults[0].count,
      pendingHomework: pendingHomeworkResults[0].count
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});*/
app.get('/evolution-homework', async (req, res) => {
  const { subject_name, standred, division, student_id } = req.query;

  // Log received query parameters for debugging
  console.log('Received query parameters:', { subject_name, standred, division, student_id });

  if (!subject_name || !standred || !division || !student_id) {
    return res.status(400).json({ error: 'Invalid query parameters' });
  }

  // Queries
  const studentNameQuery = `
    SELECT Name
    FROM ${collegeName}.Student
    WHERE studentid = ?;
  `;

  const queries = {
    totalHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_pending hp
      JOIN colleges.Subject s ON hp.subject_id = s.subject_code_prefixed
      WHERE s.subject_name = ? AND hp.standred = ? AND hp.Division = ?;
    `,
    approvedHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_submitted hs
      JOIN MGVP.homework_pending hp ON hp.homeworkp_id = hs.homeworkpending_id
      JOIN colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
      WHERE hs.student_id = ? AND hs.approval_status = 1;
    `,
    pendingHomework: `
      SELECT COUNT(*) as count
      FROM MGVP.homework_submitted hs
      JOIN MGVP.homework_pending hp ON hp.homeworkp_id = hs.homeworkpending_id
      JOIN colleges.Subject s ON hs.subject_id = s.subject_code_prefixed
      WHERE hs.student_id = ? AND hs.approval_status = 0;
    `
  };

  const params = {
    studentName: [student_id],
    totalHomework: [subject_name, standred, division],
    approvedHomework: [student_id],
    pendingHomework: [student_id]
  };

  try {
    // Execute all queries using async/await
    const [studentNameResults] = await pool.query(studentNameQuery, params.studentName);

    // Log studentNameResults for debugging
    console.log('Student Name Results:', studentNameResults);

    if (!studentNameResults || studentNameResults.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const studentName = studentNameResults[0].Name; // Adjusted to 'Name' instead of 'student_name'
    const [totalHomeworkResults] = await pool.query(queries.totalHomework, params.totalHomework);
    const [approvedHomeworkResults] = await pool.query(queries.approvedHomework, params.approvedHomework);
    const [pendingHomeworkResults] = await pool.query(queries.pendingHomework, params.pendingHomework);

    // Combine all results into one response object
    const response = {
      student_name: studentName,
      totalHomework: totalHomeworkResults[0].count,
      approvedHomework: approvedHomeworkResults[0].count,
      pendingHomework: pendingHomeworkResults[0].count
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
///////////////////////////////////////
app.post('/submit_homework', async (req, res) => {
  const { homeworkpending_id, subject_id, student_id, description, images } = req.body;

  if (!homeworkpending_id || !subject_id || !student_id || !description || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Invalid input data' });
  }

  // Get a connection from the pool
  const connection = await pool.getConnection();

  try {
    // Begin a database transaction
    await connection.beginTransaction();

    // Insert homework details into the database
    const [submissionResult] = await connection.query(
      'INSERT INTO MGVP.homework_submitted (homeworkpending_id, subject_id, student_id, description) VALUES (?, ?, ?, ?)',
      [homeworkpending_id, subject_id, student_id, description]
    );

    // Fetch the last inserted ID from the database
    const submissionId = submissionResult.insertId;

    // Prepare values for batch insert
    const imageValues = images.map(imageData => [imageData, submissionId]);

    // Insert all images in a single query
    await connection.query(
      'INSERT INTO MGVP.image_submit (image, homeworksubmitted_id) VALUES ?',
      [imageValues]
    );

    // Commit the transaction
    await connection.commit();

 res.status(200).json({ success: true, message: 'Homework submitted successfully' });

  } catch (error) {
    // Rollback the transaction if an error occurs
    if (connection) await connection.rollback();

    console.error('Failed to submit homework:', error);
    res.status(500).json({ error: 'Failed to submit homework' });

  } finally {
    // Release the connection back to the pool
    if (connection) connection.release();
  }
});
  
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
