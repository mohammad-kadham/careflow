"""Reject unsafe or incomplete archives before the deployment extracts files."""
import pathlib
import re
import sys
import tarfile


def validate(archive):
    with tarfile.open(archive, "r:gz") as bundle:
        seen = set()
        size = 0
        members = bundle.getmembers()
        if len(members) > 10000:
            raise ValueError("Too many archive entries")
        for item in members:
            path = pathlib.PurePosixPath(item.name)
            if path.is_absolute() or ".." in path.parts:
                raise ValueError("Unsafe archive path")
            if path == pathlib.PurePosixPath(".") and item.isdir():
                continue
            if not path.parts or path.parts[0] not in {"backend", "dist", "REVISION"}:
                raise ValueError("Unexpected archive entry")
            if not (item.isfile() or item.isdir()):
                raise ValueError("Links and special files are forbidden")
            if any(part.startswith(".") or part == "node_modules" for part in path.parts):
                raise ValueError("Hidden files and bundled dependencies are forbidden")
            if str(path) in seen:
                raise ValueError("Duplicate archive path")
            seen.add(str(path))
            size += item.size
            if size > 100 * 1024 * 1024:
                raise ValueError("Expanded archive exceeds 100 MB")
        required = {"REVISION", "dist/index.html", "dist/version.txt", "backend/server.js",
                    "backend/package.json", "backend/package-lock.json"}
        files = {str(pathlib.PurePosixPath(m.name)): m for m in members if m.isfile()}
        if not required <= files.keys():
            raise ValueError("Release is incomplete")
        revision = bundle.extractfile(files["REVISION"]).read(100).decode("ascii").strip()
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise ValueError("Invalid revision")
        version = bundle.extractfile(files["dist/version.txt"]).read(100).decode("ascii").strip()
        if version != revision:
            raise ValueError("Frontend revision does not match backend")
        return revision


if __name__ == "__main__":
    try:
        print(validate(sys.argv[1]))
    except (ValueError, tarfile.TarError, UnicodeError) as error:
        sys.exit(str(error))
