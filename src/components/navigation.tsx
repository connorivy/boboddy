"use client";

import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import SettingsEthernetIcon from "@mui/icons-material/SettingsEthernet";
import {
  AppBar,
  Box,
  Button,
  Container,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Tickets", icon: <ListAltIcon fontSize="small" /> },
  { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon fontSize="small" /> },
  { href: "/pipelines", label: "Pipelines", icon: <SettingsEthernetIcon fontSize="small" /> },
  { href: "/actions", label: "Actions", icon: <PlayCircleOutlineIcon fontSize="small" /> },
];

export const Navigation = () => {
  const pathname = usePathname();

  return (
    <AppBar position="sticky" elevation={1}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: "space-between" }}>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700 }}>
            boboddy
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            {links.map((link) => (
              <Button
                key={link.href}
                component={Link}
                href={link.href}
                color="inherit"
                variant={pathname === link.href ? "outlined" : "text"}
                startIcon={link.icon}
                sx={{ borderColor: "rgba(255,255,255,0.5)" }}
              >
                {link.label}
              </Button>
            ))}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
