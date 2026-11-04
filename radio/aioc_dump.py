"""Read-only dump of AIOC config registers over HID. Never writes. Run: python -m radio.aioc_dump

Register map and read protocol from hrafnkelle/aioc-util.
"""

from struct import Struct

import hid  # pip install hidapi

AIOC_VID, AIOC_PID = 0x1209, 0x7388
REPORT = Struct("<BBBL")  # report id, command, address, value
CMD_NONE = 0x00  # no write strobe: just selects the address to read

REGISTERS = {
    "MAGIC": 0x00, "USBID": 0x08, "AIOC_IOMUX0 (PTT1)": 0x24, "AIOC_IOMUX1 (PTT2)": 0x25,
    "CM108_IOMUX0": 0x44, "CM108_IOMUX1": 0x45, "CM108_IOMUX2": 0x46, "CM108_IOMUX3": 0x47,
    "SERIAL_CTRL": 0x60, "AUDIO_RX": 0x72, "AUDIO_TX": 0x78,
    "VPTT_LVLCTRL": 0x82, "VPTT_TIMCTRL": 0x84, "VCOS_LVLCTRL": 0x92, "VCOS_TIMCTRL": 0x94,
    "FOXHUNT_CTRL": 0xA0,
}
PTT_SOURCES = {0x1: "CM108GPIO1", 0x2: "CM108GPIO2", 0x4: "CM108GPIO3", 0x8: "CM108GPIO4",
               0x100: "SERIALDTR", 0x200: "SERIALRTS", 0x400: "SERIALDTRNRTS",
               0x800: "SERIALNDTRRTS", 0x1000: "VPTT"}
BUTTON_SOURCES = {0x10000: "IN1", 0x20000: "IN2", 0x1000000: "VCOS"}


def flags(value: int, names: dict[int, str]) -> str:
    return "|".join(n for bit, n in names.items() if value & bit) or "NONE"


def read(dev, address: int) -> int:
    dev.send_feature_report(list(REPORT.pack(0, CMD_NONE, address, 0)))
    return REPORT.unpack(bytes(dev.get_feature_report(0, 7)))[3]


def main() -> None:
    dev = hid.device()
    dev.open(AIOC_VID, AIOC_PID)
    try:
        print("Manufacturer:", dev.get_manufacturer_string())
        print("Product:", dev.get_product_string())
        print("Serial:", dev.get_serial_number_string())
        for name, addr in REGISTERS.items():
            v = read(dev, addr)
            extra = ""
            if name == "MAGIC":
                extra = f"  {Struct('<L').pack(v)!r}"
            elif name.startswith("AIOC_IOMUX"):
                extra = f"  {flags(v, PTT_SOURCES)}"
            elif name.startswith("CM108_IOMUX"):
                extra = f"  {flags(v, BUTTON_SOURCES)}"
            print(f"0x{addr:02x} {name:20s} {v:08x}{extra}")
    finally:
        dev.close()


if __name__ == "__main__":
    main()
