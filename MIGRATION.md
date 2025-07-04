# Repository Migration Guide

This document outlines the migration of the googledoc_demo repository to the MITDBG organization.

## Migration Overview

The repository has been prepared for migration from `sivaprasadsudhir/googledoc_demo` to `MITDBG/googledoc_demo`.

## Changes Made for Migration

### 1. Package Configuration Updates
- Updated `package.json` with:
  - Proper project name: `googledoc_demo`
  - Updated description to reflect the project purpose
  - Added repository URL pointing to MITDBG organization
  - Added homepage and bug tracking URLs
  - Updated author to "MITDBG"
  - Changed license from "ISC" to "MIT" (consistent with LICENSE file)
  - Enhanced keywords for better discoverability

### 2. Documentation Updates
- Updated README.md clone command to use MITDBG repository URL
- Maintained placeholder flexibility where appropriate

### 3. Organization Standards
- Added `.github/` directory with:
  - Issue templates for bug reports and feature requests
  - Pull request template
  - Contributing guidelines
- Enhanced `.gitignore` with comprehensive exclusions

### 4. Code Quality
- No hardcoded references to original owner found in codebase
- All external dependencies and references remain intact
- License compatibility verified (MIT License)

## Migration Checklist

### Pre-Migration
- [x] Repository analysis completed
- [x] Hardcoded references checked and updated
- [x] Documentation updated for new organization
- [x] Organization-standard files added
- [x] License compatibility verified

### During Migration
- [ ] Transfer repository to MITDBG organization
- [ ] Verify all branches are transferred
- [ ] Verify all tags are transferred
- [ ] Verify all issues are transferred
- [ ] Verify all pull requests are transferred

### Post-Migration
- [ ] Verify clone URL works: `git clone https://github.com/MITDBG/googledoc_demo.git`
- [ ] Update any external references to the repository
- [ ] Test application setup with new repository
- [ ] Update any CI/CD configurations if added later
- [ ] Notify collaborators of the new repository location

## Collaborator Considerations

### Current Access
- Review existing collaborators and their permission levels
- Document any special access requirements
- Plan for permission mapping to MITDBG organization structure

### New Organization Permissions
- Ensure collaborators are added to MITDBG organization if needed
- Apply appropriate team-based permissions
- Review and adjust access levels according to MITDBG policies

## Technical Considerations

### Dependencies
- All Python dependencies in `backend/requirements.txt` are public packages
- All Node.js dependencies in `package.json` are public packages
- No private or organization-specific dependencies found

### Configuration
- Environment variables documented in `env.example`
- No organization-specific configurations hardcoded
- Database files are in `.gitignore` (won't be transferred)

### API Integrations
- OpenAI API key configuration (user-provided)
- Together AI API key configuration (user-provided)
- External code execution endpoint mentioned in README notes

## Security Review

### Sensitive Data
- No API keys or credentials found in repository
- Environment variables properly templated in `env.example`
- Database files excluded from version control

### External Dependencies
- All dependencies are from public repositories
- No suspicious or deprecated packages identified
- MCP integration references external GitHub repositories (documented)

## Post-Migration Testing

To verify successful migration:

1. Clone the repository:
   ```bash
   git clone https://github.com/MITDBG/googledoc_demo.git
   cd googledoc_demo
   ```

2. Install dependencies:
   ```bash
   ./install-deps.sh
   ```

3. Test basic functionality:
   ```bash
   ./start-demo.sh
   ```

4. Verify all documentation links work
5. Test issue/PR templates in new repository

## Support

For questions or issues related to the migration, please:
1. Check this migration guide
2. Open an issue in the new repository
3. Contact MITDBG organization administrators

---

**Migration completed on:** [Date to be filled during actual migration]  
**Migrated by:** [Person responsible for migration]  
**Verified by:** [Person who verified the migration]