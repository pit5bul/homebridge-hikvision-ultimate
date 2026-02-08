# v1.5.5 - Security Update (tar dependency)

## 🔒 Security Patch Release

This is a **security maintenance release** that updates the indirect dependency `tar` from 7.5.6 to 7.5.7 to address a security vulnerability reported by GitHub Dependabot.

## What Changed

### Security
- ✅ Updated `tar` from 7.5.6 → 7.5.7
- ✅ Regenerated `package-lock.json` with secure dependencies
- ✅ Verified 0 vulnerabilities with `npm audit`

### No Functional Changes
- ❌ No code changes
- ❌ No configuration changes
- ❌ No breaking changes
- ❌ No new features

## Why Update?

GitHub Dependabot identified a security issue in the `tar` package (indirect dependency used by npm tooling). While this vulnerability is unlikely to affect runtime operations of the plugin, it's best practice to keep dependencies updated.

**Severity**: Low to Medium (indirect dependency)  
**Impact**: Minimal (build-time dependency)  
**Recommendation**: Update at your convenience

## Installation

### NPM
```bash
npm install -g homebridge-hikvision-ultimate@1.5.5
```

### Homebridge UI
1. Go to **Plugins**
2. Search "homebridge-hikvision-ultimate"  
3. Click **Update** to v1.5.5
4. Restart Homebridge

## Verification

After installing:
```bash
npm list tar
# Should show: tar@7.5.7
```

## Version History

- **v1.5.5** (Current) - Security: tar 7.5.7
- **v1.5.4** - Fixed config schema + restored quality profiles
- **v1.5.3** - Fixed `-f rawvideo` for software encoding
- **v1.5.2** - Fixed `-color_range mpeg` for software encoding
- **v1.5.1** - Fixed motion detection XML parsing
- **v1.5.0** - Added VAAPI hardware acceleration


