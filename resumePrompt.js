const resumePrompt = `Generate a professional IT job resume in JSON format based on the following description. Ensure the JSON is consistent, well-structured, and contains all specified keys, even if some values are empty or null. Use the exact keys provided below and maintain their hierarchy.

Input Description:
"{{userDescription}}"

JSON Structure Requirements:
personalInformation: Include the following keys:
fullName (string)
email (string)
phoneNumber (string)
location (string)
linkedIn (string or null if not provided)
gitHub (string or null if not provided)
portfolio (string or null if not provided)
summary: A brief overview of skills, experience, and career goals (string).
skills: List of object that contain two keys 'title' and 'level'

experience: A list of job roles. Each job role should include:
jobTitle (string)
company (string)
location (string)
duration (string, e.g., "Jan 2020 - Present")
responsibility(string)

education: A list of degrees. Each degree should include:
degree (string)
university (string)
location (string)
graduationYear (string)

certifications: A list of certifications. Each certification should include:
title (string)
issuingOrganization (string)
year (string)

projects: A list of key projects. Each project should include:
title (string)
description (string)
technologiesUsed (array of strings)
githubLink (string or null if not provided)

achievements: A list achievements that contains objects of keys
title (string)
year(string)
extraInformation(string)

languages: A list of spoken languages objects contain keys
id(number)
name(string)

interests: A list of additional interests or hobbies related to technology or professional development  [list of objects having keys].
id(number)
name(string)

IMPORTANT: Format your response as follows:
1. First include a <think> tag with your analysis of the input description
2. Then provide the JSON data using the format: \`\`\`json
{...your JSON data here...}
\`\`\`
3. Ensure all required keys are included, even if with null or empty values
4. Be creative but realistic with missing information based on the overall profile`;

module.exports = resumePrompt; 