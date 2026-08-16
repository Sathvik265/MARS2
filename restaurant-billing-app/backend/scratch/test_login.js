const axios = require("axios");

async function main() {
  try {
    console.log("Simulating clerk login with new name 'ROHAN'...");
    
    // We try to log in to track 'RBS1' on the current date
    const dateStr = new Date().toISOString().split("T")[0];
    
    const response = await axios.post("http://localhost:8000/api/auth/login", {
      staff_code: "ROHAN",
      date: dateStr,
      track: "RBS1"
    });
    
    console.log("Login Succeeded!");
    console.log("Response data:", response.data);
  } catch (error) {
    console.error("Login Failed:", error.response ? error.response.data : error.message);
  }
}

main();
