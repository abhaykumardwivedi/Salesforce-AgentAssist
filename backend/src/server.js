import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Salesforce AgentAssist API running on http://localhost:${port}`);
});
