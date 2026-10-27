"""Unit tests for the worker's real-colour reading and DF2 taxonomy mapping.

Run with the project venv:

    server/cv/.venv/Scripts/python.exe -m unittest discover -s server/cv -p "test_*.py"

These pin the exact failure that motivated the change: a light, almost-grey
garment pixel (like a white shirt) must read as *white*, not the nearest-palette
artefact "silver", and DF2 `*_outwear` must not be asserted as MAEVE Outerwear.
"""

import unittest

import infer


class ClassifyColourTest(unittest.TestCase):
    def test_light_neutral_whites_read_as_white(self):
        # The exact central pixel that was mislabelled "silver" before.
        self.assertEqual(infer.classify_colour((212, 208, 207))[0], "white")
        self.assertEqual(infer.classify_colour((216, 221, 224))[0], "white")
        self.assertEqual(infer.classify_colour((245, 245, 245))[0], "white")

    def test_bright_low_saturation_is_not_silver(self):
        # A bright, barely-tinted neutral must not collapse into "silver".
        for rgb in ((212, 208, 207), (196, 200, 205), (230, 231, 233)):
            self.assertNotEqual(infer.classify_colour(rgb)[0], "silver")

    def test_neutral_brightness_bands(self):
        self.assertEqual(infer.classify_colour((170, 180, 195))[0], "silver")
        self.assertEqual(infer.classify_colour((125, 125, 125))[0], "grey")
        self.assertEqual(infer.classify_colour((54, 56, 60))[0], "charcoal")
        self.assertEqual(infer.classify_colour((10, 10, 10))[0], "black")

    def test_warm_off_whites_are_distinguished(self):
        self.assertEqual(infer.classify_colour((255, 250, 225))[0], "ivory")
        self.assertEqual(infer.classify_colour((230, 220, 190))[0], "cream")
        self.assertEqual(infer.classify_colour((200, 190, 160))[0], "beige")

    def test_chromatic_colours_use_the_palette(self):
        name, conf = infer.classify_colour((200, 40, 40))
        self.assertEqual(name, "red")
        self.assertGreater(conf, 0.5)

    def test_confidence_is_a_probability(self):
        for rgb in ((212, 208, 207), (200, 40, 40), (125, 125, 125)):
            _, conf = infer.classify_colour(rgb)
            self.assertGreaterEqual(conf, 0.0)
            self.assertLessEqual(conf, 1.0)


class TaxonomyTest(unittest.TestCase):
    def test_outwear_is_upper_body_and_ambiguous(self):
        for cls in ("short_sleeved_outwear", "long_sleeved_outwear"):
            self.assertEqual(infer.DF2_CATEGORY_MAP[cls], "tops")
            self.assertIn(cls, infer.DF2_AMBIGUOUS)

    def test_shirts_map_to_shirt(self):
        self.assertEqual(infer.DF2_CATEGORY_MAP["short_sleeved_shirt"], "shirt")
        self.assertEqual(infer.DF2_CATEGORY_MAP["long_sleeved_shirt"], "shirt")
        self.assertNotIn("long_sleeved_shirt", infer.DF2_AMBIGUOUS)

    def test_outwear_is_never_asserted_as_outerwear(self):
        self.assertNotEqual(infer.DF2_CATEGORY_MAP["long_sleeved_outwear"], "outerwear")

    def test_reserved_categories_are_real(self):
        self.assertEqual(infer.DF2_CATEGORY_MAP["shorts"], "bottoms")
        self.assertEqual(infer.DF2_CATEGORY_MAP["vest_dress"], "dresses")


if __name__ == "__main__":
    unittest.main()
