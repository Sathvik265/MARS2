const axios = require('axios');

async function run() {
  try {
    // 1. Perform mock login
    const loginRes = await axios.post("http://127.0.0.1:8000/api/auth/login", {
      staff_code: "CLK",
      date: new Date().toISOString().split("T")[0],
      track: "RBS1"
    });
    
    const token = loginRes.data.auth_token;
    console.log("Logged in. Token:", token.substring(0, 10) + "...");
    
    // 2. Fetch settings
    const headers = { 'x-auth-token': token };
    const settingsRes = await axios.get("http://127.0.0.1:8000/api/settings?clerk=CLK", { headers });
    console.log("Settings:", settingsRes.data);
    
  } catch(e) {
    console.log("FAIL", e.response ? e.response.status : e.message);
    if(e.response) console.log(e.response.data);
  } finally {
    process.exit(0);
  }
}
run();
