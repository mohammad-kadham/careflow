import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("validator", pathlib.Path(__file__).parents[1] / "validate-release.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
REVISION = "a" * 40


class ReleaseValidationTests(unittest.TestCase):
    def bundle(self, extra=(), omit=(), overrides=None):
        temporary = tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False)
        temporary.close()
        self.addCleanup(pathlib.Path(temporary.name).unlink)
        entries = {"REVISION": REVISION, "dist/version.txt": REVISION, "dist/index.html": "html",
                   "backend/server.js": "code", "backend/package.json": "{}", "backend/package-lock.json": "{}"}
        entries.update(overrides or {})
        with tarfile.open(temporary.name, "w:gz") as archive:
            for name, value in entries.items():
                if name in omit:
                    continue
                data = value.encode()
                info = tarfile.TarInfo("./" + name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
            for entry in extra:
                archive.addfile(entry, io.BytesIO(b""))
        return temporary.name

    def test_valid_release(self):
        self.assertEqual(validator.validate(self.bundle()), REVISION)

    def test_rejects_traversal_and_absolute_paths(self):
        for path in ["../outside", "/etc/passwd", "backend/../../outside"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                validator.validate(self.bundle([tarfile.TarInfo(path)]))

    def test_rejects_symlinks_hardlinks_and_devices(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE]:
            info = tarfile.TarInfo("backend/link")
            info.type = kind
            info.linkname = "/etc/passwd"
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                validator.validate(self.bundle([info]))

    def test_rejects_secrets_and_dependencies(self):
        for path in ["backend/.env", "backend/node_modules/example.js", ".git/config", "extra"]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                validator.validate(self.bundle([tarfile.TarInfo(path)]))

    def test_rejects_missing_required_files(self):
        with self.assertRaises(ValueError):
            validator.validate(self.bundle(omit=["backend/server.js"]))

    def test_rejects_duplicate_paths(self):
        with self.assertRaises(ValueError):
            validator.validate(self.bundle([tarfile.TarInfo("backend/server.js")]))

    def test_rejects_invalid_revision(self):
        with self.assertRaises(ValueError):
            validator.validate(self.bundle(overrides={"REVISION": "../../outside"}))

    def test_rejects_mismatched_frontend_revision(self):
        with self.assertRaises(ValueError):
            validator.validate(self.bundle(overrides={"dist/version.txt": "b" * 40}))


if __name__ == "__main__":
    unittest.main()
