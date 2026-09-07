import ipaddress
import socket
from urllib.parse import urlparse


class EgressDenied(ValueError):
    pass


def host_from_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise EgressDenied("רק HTTPS מותר")
    host = (parsed.hostname or "").lower()
    if not host:
        raise EgressDenied("כתובת בלי host")
    return host


def assert_url_allowed(url: str, allowed_host: str) -> None:
    host = host_from_url(url)
    if host != allowed_host.lower():
        raise EgressDenied("ה-host לא תואם ל-allowlist")
    _assert_public_host(host, parsed_port(url))


def assert_public_https(url: str) -> str:
    host = host_from_url(url)
    _assert_public_host(host, parsed_port(url))
    return host


def parsed_port(url: str) -> int:
    parsed = urlparse(url)
    if parsed.port:
        return parsed.port
    return 443


def _assert_public_host(host: str, port: int) -> None:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise EgressDenied("לא ניתן לפתור את ה-host") from exc
    if not infos:
        raise EgressDenied("לא ניתן לפתור את ה-host")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not _is_public_ip(ip):
            raise EgressDenied("יעד לא ציבורי")


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )
