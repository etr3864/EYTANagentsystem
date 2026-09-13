import unittest

from backend.services.playground.media import kind_from_mime


class KindTests(unittest.TestCase):
    def test_image_and_voice(self):
        self.assertEqual(kind_from_mime("image/jpeg"), "image")
        self.assertEqual(kind_from_mime("audio/webm"), "audio")
        self.assertEqual(kind_from_mime("application/pdf"), "document")

    def test_filename_fallback(self):
        self.assertEqual(kind_from_mime("application/octet-stream", "clip.mp4"), "video")

    def test_rejects_unknown(self):
        with self.assertRaises(ValueError):
            kind_from_mime("application/x-msdownload", "x.exe")


if __name__ == "__main__":
    unittest.main()
