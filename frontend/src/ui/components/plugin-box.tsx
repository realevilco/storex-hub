import React from "react";
import styled from "styled-components";
import { fontSizes } from "../styles/globals";
import RouteLink from "./route-link";
import { Services } from "../../services/types";
import { DisplayedPluginInfo } from "../types/plugins";
import { stat } from "fs";

const StyledPluginBox = styled.div`
  display: flex;
`;
const logoRadius = "47px";
const PluginLogo = styled.div`
  width: calc(${logoRadius} * 2);
  height: calc(${logoRadius} * 2);
  min-width: calc(${logoRadius} * 2);
  min-height: calc(${logoRadius} * 2);
  border-radius: ${logoRadius};
  background: #ffffff;
  box-shadow: 0px 1px 4px rgba(0, 0, 0, 0.25);
`;
const PluginBody = styled.div`
  margin-left: 32px;
`;
const PluginTitle = styled.div`
  color: black;
  font-size: ${fontSizes.large};
  font-weight: bold;
`;
const PluginDescription = styled.div`
  font-size: ${fontSizes.smaller};
  line-height: 27px;
  color: rgba(58, 47, 69, 0.62);
`;
const PluginActions = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
  margin-left: 50px;
  flex-grow: 2;
`;
const PluginActionsInner = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
`;
const PluginAction = styled.div`
  background: black;
  width: 20px;
  height: 20px;
  margin-left: 10px;
  cursor: pointer;
`;
const PluginActionLink = styled.a`
  background: black;
  width: 20px;
  height: 20px;
  margin-left: 10px;
`;

export interface PluginBoxProps {
  services: Pick<Services, "router">;
  plugin: DisplayedPluginInfo;
  test?: number;
  onInstall?(): void;
  onEnable?(): void;
  onDisable?(): void;
}

export default function PluginBox(props: PluginBoxProps) {
  const { plugin } = props;
  const { status } = plugin;

  return (
    <StyledPluginBox>
      <PluginLogo></PluginLogo>
      <PluginBody>
        <PluginTitle>
          <RouteLink
            services={props.services}
            route="pluginSettings"
            params={{ identifier: plugin.identifier }}
          >
            {plugin.name}
          </RouteLink>
        </PluginTitle>
        <PluginDescription>{plugin.description}</PluginDescription>
      </PluginBody>
      <PluginActions>
        <PluginActionsInner>
          {/* Installing */}
          {status === "available" && (
            <PluginAction
              title={`Install`}
              onClick={props.onInstall}
            ></PluginAction>
          )}
          {status === "installing" && (
            <PluginAction title={`Installing...`}></PluginAction>
          )}
          {status === "installed-but-errored" && (
            <PluginAction
              title={`Installed, but there was an error starting it`}
            ></PluginAction>
          )}
          {status === "could-not-install" && (
            <PluginAction
              title={`Something went wrong installing the plugin`}
            ></PluginAction>
          )}
          {status === "successfully-installed" && (
            <PluginAction title={`Successfuly installed`}></PluginAction>
          )}

          {/* Enabling */}
          {status === "disabled" && (
            <PluginAction
              title={`Enable`}
              onClick={props.onEnable}
            ></PluginAction>
          )}
          {status === "successfully-enabled" && (
            <PluginAction title={`Successfuly enabled`}></PluginAction>
          )}

          {/* Disabling */}
          {status === "enabled" && (
            <PluginAction
              title={`Disable`}
              onClick={props.onDisable}
            ></PluginAction>
          )}
          {status === "disabling" && (
            <PluginAction title={`Disabling...`}></PluginAction>
          )}
          {status === "could-not-disable" && (
            <PluginAction
              title={`Something went wrong disabling the plugin`}
            ></PluginAction>
          )}
          {status === "disable-pending" && (
            <PluginAction
              title={`Restart Storex Hub to disable plugin`}
            ></PluginAction>
          )}

          {/* State-independent */}
          {plugin.siteUrl && (
            <PluginActionLink
              href={plugin.siteUrl}
              title="Go to plugin website (opens in new window"
              target="_blank"
            />
          )}
        </PluginActionsInner>
      </PluginActions>
    </StyledPluginBox>
  );
}
