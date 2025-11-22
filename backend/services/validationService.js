export const validateKYC = (data) => {
  const issues = [];

  if (!data.name || data.name.trim().length < 2) {
    issues.push("Name is missing or too short");
  }

  if (!data.dob) {
    issues.push("Date of birth is missing or unreadable");
  }

  if (!data.address || data.address.trim().length < 10) {
    issues.push("Address looks incomplete or unreadable");
  }

  if (!data.idNumber) {
    issues.push("ID Number missing");
  }

  return { issues };
};
