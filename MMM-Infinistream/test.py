#!/usr/bin/env python3

import click
import requests

@click.command()
@click.option('--mode', default='SHOWER',
              type=click.Choice(['SHOWER', 'FLUSH', 'DRAIN', 'SANITIZE'], case_sensitive=False),
              help="Mode for the Infinistream: SHOWER, FLUSH, DRAIN, SANITIZE (case-insensitive).")
@click.option('--turbidity', default=0, type=int,
              help="Turbidity value (integer).")
@click.option('--host', default='localhost', show_default=True,
              help="Hostname or IP address of the MagicMirror instance.")
@click.option('--port', default=8085, type=int, show_default=True,
              help="Webhook port configured in the Infinistream module.")
def send_update(mode, turbidity, host, port):
    """
    A simple CLI tool to send mode and turbidity updates
    to the Infinistream MagicMirror module webhook.
    """
    url = f"http://{host}:{port}/shower-update"
    payload = {
        "mode": mode.upper(),
        "turbidity": turbidity
    }

    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        click.echo(f"Sent update successfully: mode={mode}, turbidity={turbidity}")
    except requests.exceptions.RequestException as e:
        click.echo(f"Error sending update: {e}", err=True)

if __name__ == '__main__':
    send_update()
